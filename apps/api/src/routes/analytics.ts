import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { isStationOnline } from '../lib/health.js';

export type MetricKey = 'temperatura' | 'umidade' | 'vel_vento' | 'qual_ar';
const keys: MetricKey[] = ['temperatura', 'umidade', 'vel_vento', 'qual_ar'];
type Values = Record<MetricKey, number | null>;

const rangeSchema = z.object({
  range: z.enum(['1h', '6h', '12h', '24h', '7d', '30d', 'custom']).default('24h'),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  stationId: z.string().optional(),
});

const presetMs: Record<Exclude<z.infer<typeof rangeSchema>['range'], 'custom'>, number> = {
  '1h': 3_600_000,
  '6h': 21_600_000,
  '12h': 43_200_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
};

const FRESH_READING_MS = 40 * 60_000; // Coleta programada para 15 min; tolera atraso.
const MAX_HISTORY_MS = 30 * 86_400_000;
const BATCH_SIZE = 2_000;
const MAX_EVENTS = 100_000;

function numeric(value: unknown, metric: MetricKey): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (metric === 'temperatura') return value >= -40 && value <= 85 ? value : null;
  if (metric === 'umidade') return value >= 0 && value <= 100 ? value : null;
  if (metric === 'vel_vento') return value >= 0 && value <= 250 ? value : null;
  // MQ-135: índice bruto do coletor; não inferir ppm sem calibração.
  return value >= 0 && value <= 100_000 ? value : null;
}

function valuesFromPayload(raw: Prisma.JsonValue | null): Values {
  const payload = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown> : {};
  const invalidDht = payload.temperatura === 0 && payload.umidade === 0;
  return {
    temperatura: invalidDht ? null : numeric(payload.temperatura, 'temperatura'),
    umidade: invalidDht ? null : numeric(payload.umidade, 'umidade'),
    vel_vento: numeric(payload.vel_vento, 'vel_vento'),
    qual_ar: numeric(payload.qual_ar, 'qual_ar'),
  };
}

type RunningAverage = { sum: number; count: number };
type Bucket = { stationId: string; at: number; readings: Record<MetricKey, RunningAverage> };

function createAverages(): Record<MetricKey, RunningAverage> {
  return {
    temperatura: { sum: 0, count: 0 },
    umidade: { sum: 0, count: 0 },
    vel_vento: { sum: 0, count: 0 },
    qual_ar: { sum: 0, count: 0 },
  };
}

function addValues(target: Record<MetricKey, RunningAverage>, values: Values) {
  for (const metric of keys) {
    const value = values[metric];
    if (value !== null) {
      target[metric].sum += value;
      target[metric].count += 1;
    }
  }
}

function average(average: RunningAverage): number | null {
  return average.count ? Math.round(average.sum / average.count * 100) / 100 : null;
}

function averageValues(averages: Record<MetricKey, RunningAverage>): Values {
  return {
    temperatura: average(averages.temperatura),
    umidade: average(averages.umidade),
    vel_vento: average(averages.vel_vento),
    qual_ar: average(averages.qual_ar),
  };
}

function bucketSize(durationMs: number) {
  if (durationMs <= 3_600_000) return 60_000;
  if (durationMs <= 21_600_000) return 300_000;
  if (durationMs <= 43_200_000) return 600_000;
  if (durationMs <= 86_400_000) return 900_000;
  if (durationMs <= 604_800_000) return 3_600_000;
  return 21_600_000;
}

function parsePeriod(query: z.infer<typeof rangeSchema>) {
  const now = Date.now();
  const to = query.range === 'custom' ? Date.parse(query.to ?? '') : now;
  const from = query.range === 'custom'
    ? Date.parse(query.from ?? '') : to - presetMs[query.range];
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to > now + 300_000
      || to - from > MAX_HISTORY_MS || to - from < 60_000) {
    return null;
  }
  return { from: new Date(from), to: new Date(to), bucketMs: bucketSize(to - from) };
}

type SystemPoint = {
  at: string; cpuPercent: number | null; memoryPercent: number | null;
  diskPercent: number | null; temperatureCelsius: number | null;
};

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/analytics', async (request, reply) => {
    const query = rangeSchema.parse(request.query);
    const period = parsePeriod(query);
    if (!period) {
      return reply.code(400).send({ message: 'Período inválido. Escolha 1h–30d ou datas personalizadas de até 30 dias.' });
    }

    const stations = await prisma.station.findMany({
      where: query.stationId ? { id: query.stationId } : undefined,
      select: { id: true, slug: true, name: true, lastHeartbeatAt: true },
    });
    if (query.stationId && stations.length === 0) {
      return reply.code(404).send({ message: 'Estação não encontrada' });
    }

    const stationIds = stations.map((station) => station.id);
    const stationBuckets = new Map<string, Bucket>();
    const latestSnapshots = new Map<string, { receivedAt: number; values: Values }>();
    const now = Date.now();

    // Snapshot: última leitura recente por estação conectada; nunca mesclar
    // várias leituras da mesma estação como se fossem vários pontos urbanos.
    const onlineIds = stations.filter(isStationOnline).map((station) => station.id);
    if (onlineIds.length) {
      const recent = await prisma.event.findMany({
        where: {
          stationId: { in: onlineIds }, type: 'SENSOR_PAYLOAD',
          createdAt: { gte: new Date(now - FRESH_READING_MS), lte: new Date(now) },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { stationId: true, createdAt: true, metadata: true },
      });
      for (const event of recent) {
        if (!event.stationId || latestSnapshots.has(event.stationId)) continue;
        latestSnapshots.set(event.stationId, {
          receivedAt: event.createdAt.getTime(),
          values: valuesFromPayload(event.metadata),
        });
      }
    }

    let cursor: string | undefined;
    let processed = 0;
    // Todas as leituras do período, em páginas: não truncar silenciosamente os 30 dias.
    do {
      const events = await prisma.event.findMany({
        where: {
          type: 'SENSOR_PAYLOAD',
          stationId: { in: stationIds },
          createdAt: { gte: period.from, lte: period.to },
        },
        select: { id: true, stationId: true, createdAt: true, metadata: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      processed += events.length;
      if (processed > MAX_EVENTS) {
        return reply.code(413).send({ message: 'Histórico muito extenso. Selecione um período menor.' });
      }

      for (const event of events) {
        if (!event.stationId) continue;
        const at = Math.floor(event.createdAt.getTime() / period.bucketMs) * period.bucketMs;
        const key = `${event.stationId}:${at}`;
        let bucket = stationBuckets.get(key);
        if (!bucket) {
          bucket = { stationId: event.stationId, at, readings: createAverages() };
          stationBuckets.set(key, bucket);
        }
        addValues(bucket.readings, valuesFromPayload(event.metadata));
      }
      cursor = events.length === BATCH_SIZE ? events[events.length - 1].id : undefined;
    } while (cursor);

    // Duas etapas: média das leituras de cada estação em cada faixa, depois
    // média entre estações. Assim cada estação tem peso igual por intervalo.
    const timeline = new Map<number, Record<MetricKey, RunningAverage>>();
    for (const bucket of stationBuckets.values()) {
      let target = timeline.get(bucket.at);
      if (!target) { target = createAverages(); timeline.set(bucket.at, target); }
      addValues(target, averageValues(bucket.readings));
    }

    const series = [...timeline.entries()]
      .sort(([a], [b]) => a - b)
      .map(([at, values]) => ({ at: new Date(at).toISOString(), ...averageValues(values) }));

    const snapshots = [...latestSnapshots.values()];
    const current = createAverages();
    const samplesByMetric: Record<MetricKey, number> = {
      temperatura: 0, umidade: 0, vel_vento: 0, qual_ar: 0,
    };
    for (const snapshot of snapshots) {
      addValues(current, snapshot.values);
      for (const key of keys) if (snapshot.values[key] !== null) samplesByMetric[key]++;
    }

    let systemSeries: SystemPoint[] = [];
    if (query.stationId) {
      const rows = await prisma.$queryRaw<Array<{
        at: Date; cpuPercent: number | null; memoryPercent: number | null;
        diskPercent: number | null; temperatureCelsius: number | null;
      }>>`
        SELECT date_bin(${period.bucketMs}::bigint * interval '1 millisecond',
                         "collectedAt", timestamptz '2000-01-01 00:00:00+00') AS at,
               avg("cpuPercent")::float8 AS "cpuPercent",
               avg("memoryPercent")::float8 AS "memoryPercent",
               avg("diskPercent")::float8 AS "diskPercent",
               avg("temperatureCelsius")::float8 AS "temperatureCelsius"
        FROM "Metric"
        WHERE "stationId" = ${query.stationId}
          AND "collectedAt" BETWEEN ${period.from} AND ${period.to}
        GROUP BY 1 ORDER BY 1
      `;
      systemSeries = rows.map((row) => ({
        at: row.at.toISOString(),
        cpuPercent: row.cpuPercent, memoryPercent: row.memoryPercent,
        diskPercent: row.diskPercent, temperatureCelsius: row.temperatureCelsius,
      }));
    }

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString(), range: query.range },
      bucketMinutes: period.bucketMs / 60_000,
      scope: query.stationId ? 'station' : 'city',
      totalStations: stations.length,
      onlineStations: onlineIds.length,
      freshStations: snapshots.length,
      snapshotAt: snapshots.length ? new Date(Math.max(...snapshots.map((s) => s.receivedAt))).toISOString() : null,
      averages: averageValues(current),
      samplesByMetric,
      series,
      systemSeries,
      // Recebimento é o carimbo temporal dos gráficos; MQTT e CSV não são alterados.
      timeBasis: 'receivedAt',
    };
  });
}
