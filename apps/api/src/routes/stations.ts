import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { isStationOnline, secondsSince } from '../lib/health.js';

const createStationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-zA-Z0-9-_]+$/),
  location: z.string().optional(),
  description: z.string().optional(),
});

export async function stationRoutes(app: FastifyInstance) {
  app.get('/stations', async () => {
    const stations = await prisma.station.findMany({ orderBy: { name: 'asc' } });

    return stations.map((station) => ({
      ...station,
      computedStatus: isStationOnline(station) ? 'ONLINE' : 'OFFLINE',
      secondsSinceHeartbeat: secondsSince(station.lastHeartbeatAt),
      secondsSinceLastData: secondsSince(station.lastDataReceivedAt),
    }));
  });

  app.post('/stations', async (request, reply) => {
    const body = createStationSchema.parse(request.body);

    const station = await prisma.station.create({ data: body });
    reply.code(201);
    return station;
  });

  app.get('/stations/:id', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);

    const station = await prisma.station.findUnique({
      where: { id: params.id },
      include: {
        metrics: { orderBy: { collectedAt: 'desc' }, take: 60 },
        events: { orderBy: { createdAt: 'desc' }, take: 20 },
        logs: { orderBy: { occurredAt: 'desc' }, take: 50 },
        commands: { orderBy: { requestedAt: 'desc' }, take: 20 },
      },
    });

    if (!station) {
      return reply.code(404).send({ message: 'Estação não encontrada' });
    }

    return {
      ...station,
      computedStatus: isStationOnline(station) ? 'ONLINE' : 'OFFLINE',
      secondsSinceHeartbeat: secondsSince(station.lastHeartbeatAt),
      secondsSinceLastData: secondsSince(station.lastDataReceivedAt),
      metrics: station.metrics.reverse(),
    };
  });

  app.get('/stations/:id/metrics', async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ limit: z.coerce.number().min(1).max(500).default(120) }).parse(request.query);

    const metrics = await prisma.metric.findMany({
      where: { stationId: params.id },
      orderBy: { collectedAt: 'desc' },
      take: query.limit,
    });

    return metrics.reverse();
  });
}
