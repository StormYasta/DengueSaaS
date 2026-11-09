import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { isStationOnline } from '../lib/health.js';

const stationEdit = z.object({
  name: z.string().min(2).max(150).optional(),
  location: z.string().max(200).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}).refine(
  (data) => (data.latitude === undefined && data.longitude === undefined)
    || (data.latitude !== undefined && data.longitude !== undefined
      && (data.latitude === null) === (data.longitude === null)),
  { message: 'Latitude e longitude precisam ser informadas juntas' },
);

const fields = [
  'temperatura', 'umidade', 'qual_ar', 'pluviometrico', 'vel_vento', 'dir_vento',
  'chuva_tensao', 'anemometro_pulsos', 'anemometro_rpm', 'anemometro_intervalo_s',
  'pressao_abs', 'pressao_rel',
];

const heading = ['estacao', 'data_hora', ...fields].join(';') + '\r\n';

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  // Evita interpretação como fórmula ao abrir o CSV em planilhas.
  const safe = /^[=+@\t\r]/.test(raw) || /^-[^\d]/.test(raw) ? "'" + raw : raw;
  return /[;"\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

async function streamCsv(reply: FastifyReply, stationId?: string) {
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Cache-Control', 'no-store');
  reply.header('Content-Disposition',
    `attachment; filename="dengue-${stationId ? 'estacao-' + stationId : 'todas-estacoes'}-${new Date().toISOString().slice(0, 10)}.csv"`);
  reply.hijack();
  reply.raw.write('\ufeff' + heading);

  let cursor: string | undefined;
  try {
    do {
      const batch = await prisma.event.findMany({
        where: { type: 'SENSOR_PAYLOAD', ...(stationId ? { stationId } : {}) },
        include: { station: { select: { slug: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 500,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      for (const event of batch) {
        const payload = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
          ? event.metadata as Record<string, unknown> : {};
        const values = [
          event.station?.slug ?? '',
          (typeof payload.collectedAt === 'string' ? payload.collectedAt : event.createdAt.toISOString()),
          ...fields.map((field) => payload[field]),
        ];
        if (!reply.raw.write(values.map(csvCell).join(';') + '\r\n')) {
          await new Promise<void>((resolve) => reply.raw.once('drain', resolve));
        }
      }
      cursor = batch.length === 500 ? batch[batch.length - 1].id : undefined;
    } while (cursor && !reply.raw.destroyed);
    reply.raw.end();
  } catch (error) {
    reply.raw.destroy(error instanceof Error ? error : new Error('Falha na exportação CSV'));
  }
}

export async function adminRoutes(app: FastifyInstance) {
  app.patch('/stations/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = stationEdit.parse(request.body);
    const station = await prisma.station.findUnique({ where: { id } });
    if (!station) return reply.code(404).send({ message: 'Estação não encontrada' });

    const edited = await prisma.station.update({ where: { id }, data: input });
    await prisma.event.create({
      data: {
        stationId: id, type: 'STATION_UPDATED', severity: 'INFO',
        message: `Estação editada por ${request.adminUser!.username}`,
        metadata: { fields: Object.keys(input) },
      },
    });
    return edited;
  });

  app.get('/export/stations.csv', async (_request, reply) => streamCsv(reply));

  app.get('/export/stations/:id.csv', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const station = await prisma.station.findUnique({ where: { id } });
    if (!station) return reply.code(404).send({ message: 'Estação não encontrada' });
    return streamCsv(reply, id);
  });

  app.get('/admin/activity', async (request) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query);
    return prisma.event.findMany({
      where: { type: { in: [
        'STATION_UPDATED', 'STATION_RESTART_REQUESTED', 'HOST_REBOOT_REQUESTED',
        'COMMAND_RESULT', 'REBOOT_COMPLETED', 'ADMIN_PASSWORD_CHANGED', 'REGION_MAP_IMPORTED',
        'USER_CREATED', 'USER_UPDATED', 'USER_PASSWORD_RESET',
      ] } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { station: { select: { name: true, slug: true } } },
    });
  });

  app.post('/stations/:id/restart', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { action } = z.object({
      action: z.enum(['RESTART_COLLECTOR', 'REBOOT_HOST']),
    }).parse(request.body);
    const station = await prisma.station.findUnique({ where: { id } });
    if (!station) return reply.code(404).send({ message: 'Estação não encontrada' });
    if (!isStationOnline(station)) {
      return reply.code(409).send({ message: 'Estação offline. Não é possível executar o comando agora.' });
    }
    if (action === 'REBOOT_HOST' && !station.lastBootId) {
      return reply.code(409).send({ message: 'Agente ainda não informou bootId. Atualize o agente antes de reiniciar a Raspberry.' });
    }
    const pending = await prisma.command.findFirst({
      where: { stationId: id, status: { in: ['PENDING', 'SENT', 'RUNNING'] }, requestedAt: { gte: new Date(Date.now() - 10 * 60_000) } },
    });
    if (pending) return reply.code(409).send({ message: 'Esta estação já possui comando pendente.' });

    const command = await prisma.command.create({
      data: {
        stationId: id, type: action, requestedBy: request.adminUser!.username,
        payload: action === 'REBOOT_HOST' ? { previousBootId: station.lastBootId } : {},
      },
    });
    await prisma.event.create({
      data: {
        stationId: id, severity: 'WARNING',
        type: action === 'REBOOT_HOST' ? 'HOST_REBOOT_REQUESTED' : 'STATION_RESTART_REQUESTED',
        message: `${request.adminUser!.username} solicitou ${action}`,
        metadata: { commandId: command.id },
      },
    });
    reply.code(202);
    return { id: command.id, status: command.status, type: command.type };
  });
}
