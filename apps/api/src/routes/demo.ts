import { FastifyInstance } from 'fastify';
import { z } from 'zod';

type Station = {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  description?: string | null;
  ipAddress: string | null;
  agentVersion: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'WARNING';
  computedStatus: 'ONLINE' | 'OFFLINE';
  serviceStatus: 'RUNNING' | 'STOPPED' | 'FAILED' | 'UNKNOWN';
  lastHeartbeatAt: string | null;
  lastDataReceivedAt: string | null;
  lastCpuPercent: number | null;
  lastMemoryPercent: number | null;
  lastDiskPercent: number | null;
  lastTemperatureCelsius: number | null;
  uptimeSeconds: number | null;
  secondsSinceHeartbeat: number | null;
  secondsSinceLastData: number | null;
  metrics: Metric[];
  events: Event[];
  logs: StationLog[];
  commands: Command[];
};

type Metric = {
  id: string;
  collectedAt: string;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  temperatureCelsius: number | null;
  uptimeSeconds: number | null;
};

type Event = {
  id: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  type: string;
  message: string;
  createdAt: string;
};

type StationLog = {
  id: string;
  level: string;
  message: string;
  source?: string | null;
  occurredAt: string;
};

type Command = {
  id: string;
  type: string;
  status: string;
  requestedBy?: string | null;
  requestedAt: string;
  payload?: Record<string, unknown> | null;
};

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function secondsSince(date?: string | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
}

function metricHistory(baseCpu: number, baseRam: number, baseDisk: number, baseTemp: number): Metric[] {
  return Array.from({ length: 48 }).map((_, index) => {
    const point = 47 - index;
    const wave = Math.sin(index / 5);

    return {
      id: `metric-${baseCpu}-${index}`,
      collectedAt: minutesAgo(point * 30),
      cpuPercent: Math.min(98, Math.max(2, baseCpu + wave * 8 + (index % 4))),
      memoryPercent: Math.min(95, Math.max(10, baseRam + wave * 5 + (index % 3))),
      diskPercent: Math.min(99, Math.max(5, baseDisk + index * 0.05)),
      temperatureCelsius: Math.min(85, Math.max(25, baseTemp + wave * 3)),
      uptimeSeconds: 86400 * 3 + index * 1800,
    };
  });
}

function makeStation(input: Omit<Station, 'secondsSinceHeartbeat' | 'secondsSinceLastData' | 'metrics' | 'events' | 'logs' | 'commands'> & {
  baseCpu?: number;
  baseRam?: number;
  baseDisk?: number;
  baseTemp?: number;
  events?: Event[];
  logs?: StationLog[];
  commands?: Command[];
}): Station {
  return {
    ...input,
    secondsSinceHeartbeat: secondsSince(input.lastHeartbeatAt),
    secondsSinceLastData: secondsSince(input.lastDataReceivedAt),
    metrics: input.lastHeartbeatAt ? metricHistory(input.baseCpu ?? 0, input.baseRam ?? 0, input.baseDisk ?? 0, input.baseTemp ?? 0) : [],
    events: input.events ?? [],
    logs: input.logs ?? [],
    commands: input.commands ?? [],
  };
}

let stations: Station[] = [
  makeStation({
    id: 'demo-e01',
    name: 'E01 - Laboratório FATEC',
    slug: 'E01',
    location: 'FATEC Rio Preto - Laboratório de Pesquisa',
    ipAddress: '192.168.0.21',
    agentVersion: '1.0.0',
    status: 'ONLINE',
    computedStatus: 'ONLINE',
    serviceStatus: 'RUNNING',
    lastHeartbeatAt: minutesAgo(1),
    lastDataReceivedAt: minutesAgo(3),
    lastCpuPercent: 15,
    lastMemoryPercent: 42,
    lastDiskPercent: 65,
    lastTemperatureCelsius: 48,
    uptimeSeconds: 278912,
    baseCpu: 15,
    baseRam: 42,
    baseDisk: 65,
    baseTemp: 48,
    events: [{ id: 'evt-e01-1', severity: 'INFO', type: 'HEALTHY', message: 'Estação operando normalmente.', createdAt: minutesAgo(1) }],
    logs: [{ id: 'log-e01-1', level: 'INFO', source: 'collector', message: 'Coleta realizada com sucesso.', occurredAt: minutesAgo(3) }],
  }),
  makeStation({
    id: 'demo-e02',
    name: 'E02 - Área Externa',
    slug: 'E02',
    location: 'FATEC Rio Preto - Pátio externo',
    ipAddress: '192.168.0.22',
    agentVersion: '1.0.0',
    status: 'OFFLINE',
    computedStatus: 'OFFLINE',
    serviceStatus: 'UNKNOWN',
    lastHeartbeatAt: minutesAgo(180),
    lastDataReceivedAt: minutesAgo(190),
    lastCpuPercent: 0,
    lastMemoryPercent: 0,
    lastDiskPercent: 72,
    lastTemperatureCelsius: 0,
    uptimeSeconds: null,
    baseCpu: 8,
    baseRam: 36,
    baseDisk: 72,
    baseTemp: 44,
    events: [{ id: 'evt-e02-1', severity: 'CRITICAL', type: 'STATION_OFFLINE', message: 'Estação sem heartbeat há mais de 2 horas.', createdAt: minutesAgo(120) }],
    logs: [{ id: 'log-e02-1', level: 'ERROR', source: 'agent', message: 'Falha ao conectar com a API central antes de ficar offline.', occurredAt: minutesAgo(180) }],
  }),
  makeStation({
    id: 'demo-e03',
    name: 'E03 - Caixa Protegida',
    slug: 'E03',
    location: 'Estação com abrigo meteorológico',
    ipAddress: '192.168.0.23',
    agentVersion: '1.0.1',
    status: 'WARNING',
    computedStatus: 'ONLINE',
    serviceStatus: 'FAILED',
    lastHeartbeatAt: minutesAgo(2),
    lastDataReceivedAt: minutesAgo(95),
    lastCpuPercent: 31,
    lastMemoryPercent: 58,
    lastDiskPercent: 81,
    lastTemperatureCelsius: 52,
    uptimeSeconds: 301552,
    baseCpu: 31,
    baseRam: 58,
    baseDisk: 81,
    baseTemp: 52,
    events: [
      { id: 'evt-e03-1', severity: 'ERROR', type: 'SERVICE_FAILED', message: 'Serviço de coleta Python falhou no systemd.', createdAt: minutesAgo(95) },
      { id: 'evt-e03-2', severity: 'WARNING', type: 'NO_DATA_TRANSMISSION', message: 'Sem transmissão de dados climáticos há mais de 90 minutos.', createdAt: minutesAgo(90) },
    ],
    logs: [
      { id: 'log-e03-1', level: 'ERROR', source: 'collector', message: 'Timeout de leitura no sensor DHT22.', occurredAt: minutesAgo(96) },
      { id: 'log-e03-2', level: 'INFO', source: 'systemd', message: 'Tentativa de reinício automático do serviço.', occurredAt: minutesAgo(94) },
    ],
    commands: [{ id: 'cmd-e03-1', type: 'restart_service', status: 'PENDING', requestedBy: 'admin@demo.local', requestedAt: minutesAgo(10), payload: { serviceName: 'coletor-clima.service' } }],
  }),
  makeStation({
    id: 'demo-e04',
    name: 'E04 - Telhado Bloco B',
    slug: 'E04',
    location: 'Telhado do Bloco B',
    ipAddress: '192.168.0.24',
    agentVersion: '1.0.1',
    status: 'WARNING',
    computedStatus: 'ONLINE',
    serviceStatus: 'RUNNING',
    lastHeartbeatAt: minutesAgo(1),
    lastDataReceivedAt: minutesAgo(8),
    lastCpuPercent: 78,
    lastMemoryPercent: 76,
    lastDiskPercent: 91,
    lastTemperatureCelsius: 68,
    uptimeSeconds: 296102,
    baseCpu: 78,
    baseRam: 76,
    baseDisk: 91,
    baseTemp: 68,
    events: [
      { id: 'evt-e04-1', severity: 'WARNING', type: 'HIGH_TEMPERATURE', message: 'Temperatura da Raspberry acima do limite recomendado.', createdAt: minutesAgo(12) },
      { id: 'evt-e04-2', severity: 'WARNING', type: 'DISK_USAGE_HIGH', message: 'Uso de disco acima de 90%.', createdAt: minutesAgo(18) },
    ],
    logs: [
      { id: 'log-e04-1', level: 'WARNING', source: 'agent', message: 'Temperatura elevada detectada durante heartbeat.', occurredAt: minutesAgo(12) },
      { id: 'log-e04-2', level: 'WARNING', source: 'storage', message: 'Diretório de logs consumindo espaço excessivo.', occurredAt: minutesAgo(18) },
    ],
  }),
  makeStation({
    id: 'demo-e05',
    name: 'E05 - Jardim Experimental',
    slug: 'E05',
    location: 'Jardim experimental de sensores',
    ipAddress: '192.168.0.25',
    agentVersion: '0.9.8',
    status: 'OFFLINE',
    computedStatus: 'OFFLINE',
    serviceStatus: 'STOPPED',
    lastHeartbeatAt: null,
    lastDataReceivedAt: null,
    lastCpuPercent: null,
    lastMemoryPercent: null,
    lastDiskPercent: null,
    lastTemperatureCelsius: null,
    uptimeSeconds: null,
    events: [{ id: 'evt-e05-1', severity: 'CRITICAL', type: 'NEVER_CONNECTED', message: 'Estação cadastrada, mas sem primeiro heartbeat recebido.', createdAt: minutesAgo(480) }],
    logs: [{ id: 'log-e05-1', level: 'INFO', source: 'admin', message: 'Estação cadastrada para instalação em campo.', occurredAt: minutesAgo(480) }],
  }),
];

function publicStation(station: Station) {
  return {
    ...station,
    secondsSinceHeartbeat: secondsSince(station.lastHeartbeatAt),
    secondsSinceLastData: secondsSince(station.lastDataReceivedAt),
  };
}

export async function demoRoutes(app: FastifyInstance) {
  app.get('/dashboard', async () => {
    const updated = stations.map(publicStation);
    const onlineCount = updated.filter((station) => station.computedStatus === 'ONLINE').length;
    const offlineCount = updated.length - onlineCount;
    const serviceProblems = updated.filter((station) => station.serviceStatus !== 'RUNNING').length;

    return {
      summary: {
        totalStations: updated.length,
        onlineCount,
        offlineCount,
        serviceProblems,
      },
      stations: updated,
    };
  });

  app.get('/stations', async () => stations.map(publicStation));

  app.get('/stations/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const station = stations.find((item) => item.id === params.id || item.slug === params.id);

    if (!station) {
      return reply.code(404).send({ message: 'Estação não encontrada' });
    }

    return publicStation(station);
  });

  app.get('/stations/:id/metrics', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const station = stations.find((item) => item.id === params.id || item.slug === params.id);

    if (!station) {
      return reply.code(404).send({ message: 'Estação não encontrada' });
    }

    return station.metrics;
  });

  app.post('/stations', async (request, reply) => {
    const body = z.object({
      name: z.string().min(2),
      slug: z.string().min(2),
      location: z.string().optional(),
      description: z.string().optional(),
    }).parse(request.body);

    const station = makeStation({
      id: `demo-${body.slug.toLowerCase()}`,
      name: body.name,
      slug: body.slug,
      location: body.location ?? null,
      description: body.description ?? null,
      ipAddress: null,
      agentVersion: null,
      status: 'OFFLINE',
      computedStatus: 'OFFLINE',
      serviceStatus: 'UNKNOWN',
      lastHeartbeatAt: null,
      lastDataReceivedAt: null,
      lastCpuPercent: null,
      lastMemoryPercent: null,
      lastDiskPercent: null,
      lastTemperatureCelsius: null,
      uptimeSeconds: null,
    });

    stations = [...stations, station];
    reply.code(201);
    return publicStation(station);
  });

  app.post('/heartbeats', async (request, reply) => {
    const body = z.object({
      stationSlug: z.string().min(2),
      stationName: z.string().optional(),
      location: z.string().optional().nullable(),
      ipAddress: z.string().optional().nullable(),
      agentVersion: z.string().optional().nullable(),
      serviceStatus: z.enum(['RUNNING', 'STOPPED', 'FAILED', 'UNKNOWN']).default('UNKNOWN'),
      cpuPercent: z.number(),
      memoryPercent: z.number(),
      diskPercent: z.number(),
      temperatureCelsius: z.number().optional().nullable(),
      uptimeSeconds: z.number().optional().nullable(),
      lastCollectionAt: z.string().optional().nullable(),
      recordsLast24h: z.number().optional(),
    }).parse(request.body);

    const existingIndex = stations.findIndex((station) => station.slug === body.stationSlug);
    const now = new Date().toISOString();
    const metric: Metric = {
      id: `metric-live-${Date.now()}`,
      collectedAt: now,
      cpuPercent: body.cpuPercent,
      memoryPercent: body.memoryPercent,
      diskPercent: body.diskPercent,
      temperatureCelsius: body.temperatureCelsius ?? null,
      uptimeSeconds: body.uptimeSeconds ?? null,
    };

    if (existingIndex >= 0) {
      const current = stations[existingIndex];
      stations[existingIndex] = publicStation({
        ...current,
        name: body.stationName ?? current.name,
        location: body.location ?? current.location,
        ipAddress: body.ipAddress ?? current.ipAddress,
        agentVersion: body.agentVersion ?? current.agentVersion,
        status: body.serviceStatus === 'RUNNING' ? 'ONLINE' : 'WARNING',
        computedStatus: 'ONLINE',
        serviceStatus: body.serviceStatus,
        lastHeartbeatAt: now,
        lastDataReceivedAt: body.lastCollectionAt ?? now,
        lastCpuPercent: body.cpuPercent,
        lastMemoryPercent: body.memoryPercent,
        lastDiskPercent: body.diskPercent,
        lastTemperatureCelsius: body.temperatureCelsius ?? null,
        uptimeSeconds: body.uptimeSeconds ?? null,
        metrics: [...current.metrics.slice(-119), metric],
      });
    } else {
      stations.push(makeStation({
        id: `demo-${body.stationSlug.toLowerCase()}`,
        name: body.stationName ?? body.stationSlug,
        slug: body.stationSlug,
        location: body.location ?? null,
        ipAddress: body.ipAddress ?? null,
        agentVersion: body.agentVersion ?? null,
        status: body.serviceStatus === 'RUNNING' ? 'ONLINE' : 'WARNING',
        computedStatus: 'ONLINE',
        serviceStatus: body.serviceStatus,
        lastHeartbeatAt: now,
        lastDataReceivedAt: body.lastCollectionAt ?? now,
        lastCpuPercent: body.cpuPercent,
        lastMemoryPercent: body.memoryPercent,
        lastDiskPercent: body.diskPercent,
        lastTemperatureCelsius: body.temperatureCelsius ?? null,
        uptimeSeconds: body.uptimeSeconds ?? null,
        baseCpu: body.cpuPercent,
        baseRam: body.memoryPercent,
        baseDisk: body.diskPercent,
        baseTemp: body.temperatureCelsius ?? 45,
      }));
    }

    reply.code(201);
    return { ok: true, stationSlug: body.stationSlug, receivedAt: now, demoMode: true };
  });

  app.post('/logs', async (request, reply) => {
    const body = z.object({
      stationSlug: z.string().min(2),
      level: z.string().default('INFO'),
      message: z.string().min(1),
      source: z.string().optional(),
      occurredAt: z.string().optional(),
    }).parse(request.body);

    const station = stations.find((item) => item.slug === body.stationSlug);
    if (!station) {
      return reply.code(404).send({ message: 'Estação não encontrada' });
    }

    const log = {
      id: `log-live-${Date.now()}`,
      level: body.level,
      message: body.message,
      source: body.source,
      occurredAt: body.occurredAt ?? new Date().toISOString(),
    };

    station.logs = [log, ...station.logs].slice(0, 50);
    reply.code(201);
    return log;
  });
}
