import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { isStationOnline, secondsSince } from '../lib/health.js';
import { env } from '../env.js';

const createStationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-zA-Z0-9-_]+$/),
  location: z.string().optional(),
  description: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export async function stationRoutes(app: FastifyInstance) {
  app.get('/stations', async () => {
    const stations = await prisma.station.findMany({
      orderBy: { name: 'asc' },
      include: {
        events: {
          where: { type: 'SENSOR_PAYLOAD' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return stations.map((station) => {
      const latestReading = station.events[0];
      const { events, ...stationData } = station;

      return {
        ...stationData,
        computedStatus: isStationOnline(station) ? 'ONLINE' : 'OFFLINE',
        secondsSinceHeartbeat: secondsSince(station.lastHeartbeatAt),
        secondsSinceLastData: secondsSince(station.lastDataReceivedAt),
        latestSensorPayload: latestReading?.metadata ?? null,
        latestSensorPayloadAt: latestReading?.createdAt ?? null,
      };
    });
  });

  app.post('/stations', async (request, reply) => {
    const body = createStationSchema.parse(request.body);
    const station = await prisma.station.create({ data: body });
    reply.code(201);
    return station;
  });

  // Localização é mantida no servidor; nunca é sobrescrita pelo heartbeat.
  // Chave administrativa exigida para evitar edições anônimas no mapa.
  app.patch('/stations/:id/location', async (request, reply) => {
    if (!env.adminApiKey) {
      return reply.code(503).send({ message: 'ADMIN_API_KEY não configurada' });
    }
    if (request.headers['x-admin-key'] !== env.adminApiKey) {
      return reply.code(401).send({ message: 'Chave administrativa inválida' });
    }

    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      latitude: z.number().min(-90).max(90).nullable(),
      longitude: z.number().min(-180).max(180).nullable(),
    }).refine(
      (value) => (value.latitude === null) === (value.longitude === null),
      { message: 'Informe as duas coordenadas ou nenhuma' },
    ).parse(request.body);

    const station = await prisma.station.findUnique({ where: { id } });
    if (!station) {
      return reply.code(404).send({ message: 'Estação não encontrada' });
    }

    const updated = await prisma.station.update({
      where: { id },
      data: { latitude: body.latitude, longitude: body.longitude },
    });
    return { id: updated.id, latitude: updated.latitude, longitude: updated.longitude };
  });

  app.get('/stations/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);

    const station = await prisma.station.findUnique({
      where: { id: params.id },
      include: {
        metrics: { orderBy: { collectedAt: 'desc' }, take: 60 },
        events: {
          where: { type: { not: 'SENSOR_PAYLOAD' } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        logs: { orderBy: { occurredAt: 'desc' }, take: 50 },
        commands: { orderBy: { requestedAt: 'desc' }, take: 20 },
      },
    });

    if (!station) {
      return reply.code(404).send({ message: 'Estação não encontrada' });
    }

    const sensorEvents = await prisma.event.findMany({
      where: {
        stationId: station.id,
        type: 'SENSOR_PAYLOAD',
      },
      orderBy: { createdAt: 'desc' },
      take: 96,
    });

    const sensorReadings = sensorEvents
      .map((event) => ({
        id: event.id,
        collectedAt: event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata) && typeof (event.metadata as Record<string, unknown>).collectedAt === 'string'
          ? (event.metadata as Record<string, unknown>).collectedAt as string : event.createdAt,
        payload: event.metadata,
      }))
      .reverse();

    const latestReading = sensorReadings.at(-1);

    return {
      ...station,
      computedStatus: isStationOnline(station) ? 'ONLINE' : 'OFFLINE',
      secondsSinceHeartbeat: secondsSince(station.lastHeartbeatAt),
      secondsSinceLastData: secondsSince(station.lastDataReceivedAt),
      metrics: station.metrics.reverse(),
      sensorReadings,
      latestSensorPayload: latestReading?.payload ?? null,
      latestSensorPayloadAt: latestReading?.collectedAt ?? null,
    };
  });

  app.get('/stations/:id/metrics', async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const query = z
      .object({
        limit: z.coerce.number().min(1).max(500).default(120),
      })
      .parse(request.query);

    const metrics = await prisma.metric.findMany({
      where: { stationId: params.id },
      orderBy: { collectedAt: 'desc' },
      take: query.limit,
    });

    return metrics.reverse();
  });
}
