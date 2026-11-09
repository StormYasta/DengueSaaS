import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export async function agentCommandRoutes(app: FastifyInstance) {
  app.get('/agent/commands', async (request, reply) => {
    const { stationSlug } = z.object({ stationSlug: z.string().min(2) }).parse(request.query);
    const station = await prisma.station.findUnique({ where: { slug: stationSlug } });
    if (!station) return reply.code(404).send({ message: 'Estação desconhecida' });

    // Nunca executa comandos antigos de uma estação que ficou offline.
    await prisma.command.updateMany({
      where: {
        stationId: station.id, status: 'PENDING',
        requestedAt: { lt: new Date(Date.now() - 5 * 60_000) },
      },
      data: { status: 'EXPIRED', finishedAt: new Date(), result: 'Comando expirou após 5 minutos' },
    });

    const candidate = await prisma.command.findFirst({
      where: {
        stationId: station.id, status: 'PENDING',
        type: { in: ['RESTART_COLLECTOR', 'REBOOT_HOST'] },
      },
      orderBy: { requestedAt: 'asc' },
    });
    if (!candidate) return { command: null };

    const claim = await prisma.command.updateMany({
      where: { id: candidate.id, status: 'PENDING' },
      data: { status: 'SENT', sentAt: new Date() },
    });
    if (claim.count === 0) return { command: null };
    return { command: { id: candidate.id, type: candidate.type } };
  });

  app.post('/agent/commands/:id/result', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = z.object({
      stationSlug: z.string().min(2),
      status: z.enum(['RUNNING', 'SUCCESS', 'FAILED']),
      result: z.string().max(1000).optional(),
    }).parse(request.body);
    const command = await prisma.command.findFirst({
      where: { id, station: { slug: input.stationSlug } },
    });
    if (!command) return reply.code(404).send({ message: 'Comando desconhecido' });
    if (!['SENT', 'RUNNING'].includes(command.status)) {
      return reply.code(409).send({ message: 'Comando já finalizado' });
    }
    if (input.status === 'RUNNING' && command.type !== 'REBOOT_HOST') {
      return reply.code(400).send({ message: 'Estado RUNNING reservado para reinicialização da Raspberry' });
    }
    const updated = await prisma.command.update({
      where: { id }, data: {
        status: input.status,
        result: input.result ?? null,
        finishedAt: input.status === 'RUNNING' ? null : new Date(),
      },
    });
    await prisma.event.create({
      data: {
        stationId: command.stationId,
        severity: input.status === 'FAILED' ? 'ERROR' : 'INFO',
        type: 'COMMAND_RESULT',
        message: `${command.type} — ${input.status}`,
        metadata: { commandId: id, result: input.result ?? '' },
      },
    });
    return { id: updated.id, status: updated.status };
  });
}
