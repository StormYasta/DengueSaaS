import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const logSchema = z.object({
  stationSlug: z.string().min(2),
  level: z.string().default('INFO'),
  message: z.string().min(1),
  source: z.string().optional(),
  occurredAt: z.coerce.date().optional(),
});

export async function logRoutes(app: FastifyInstance) {
  app.post('/logs', async (request, reply) => {
    const body = logSchema.parse(request.body);

    const station = await prisma.station.findUnique({ where: { slug: body.stationSlug } });
    if (!station) {
      return reply.code(404).send({ message: 'Estação não encontrada' });
    }

    const log = await prisma.stationLog.create({
      data: {
        stationId: station.id,
        level: body.level,
        message: body.message,
        source: body.source,
        occurredAt: body.occurredAt ?? new Date(),
      },
    });

    reply.code(201);
    return log;
  });
}
