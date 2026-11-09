import { FastifyInstance } from 'fastify';
import { ServiceStatus, StationStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../env.js';

const sensorPayloadSchema = z
  .object({
    temperatura: z.number().optional().nullable(),
    umidade: z.number().optional().nullable(),
    pressao_abs: z.number().optional().nullable(),
    pressao_rel: z.number().optional().nullable(),
    qual_ar: z.number().optional().nullable(),
    pluviometrico: z.union([z.number(), z.boolean()]).optional().nullable(),
    chuva_tensao: z.number().optional().nullable(),
    vel_vento: z.number().optional().nullable(),
    dir_vento: z.number().optional().nullable(),
    anemometro_pulsos: z.number().int().nonnegative().optional().nullable(),
    anemometro_rpm: z.number().nonnegative().optional().nullable(),
    anemometro_intervalo_s: z.number().nonnegative().optional().nullable(),
  })
  .passthrough();

const heartbeatSchema = z.object({
  stationSlug: z.string().min(2),
  stationName: z.string().min(2).optional(),
  location: z.string().optional(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  ipAddress: z.string().optional(),
  agentVersion: z.string().optional(),
  serviceStatus: z.nativeEnum(ServiceStatus).default(ServiceStatus.UNKNOWN),
  cpuPercent: z.number().min(0).max(100),
  memoryPercent: z.number().min(0).max(100),
  diskPercent: z.number().min(0).max(100),
  temperatureCelsius: z.number().optional().nullable(),
  uptimeSeconds: z.number().int().nonnegative().optional(),
  bootId: z.string().uuid().optional(),
  lastCollectionAt: z.coerce.date().optional().nullable(),
  recordsLast24h: z.number().int().nonnegative().default(0),
  sensorPayload: sensorPayloadSchema.optional(),
});

export async function heartbeatRoutes(app: FastifyInstance) {
  app.post('/heartbeats', async (request, reply) => {
    if (env.stationApiKey && request.headers['x-station-key'] !== env.stationApiKey) {
      return reply.code(401).send({ message: 'Chave da estação inválida' });
    }
    const body = heartbeatSchema.parse(request.body);
    const now = new Date();
    const previous = await prisma.station.findUnique({ where: { slug: body.stationSlug }, select: { lastBootId: true, serviceStatus: true } });

    const station = await prisma.station.upsert({
      where: { slug: body.stationSlug },
      create: {
        slug: body.stationSlug,
        name: body.stationName ?? body.stationSlug,
        location: body.location,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        ipAddress: body.ipAddress,
        agentVersion: body.agentVersion,
        status: StationStatus.ONLINE,
        serviceStatus: body.serviceStatus,
        lastHeartbeatAt: now,
        lastDataReceivedAt: body.lastCollectionAt ?? null,
        lastCpuPercent: body.cpuPercent,
        lastMemoryPercent: body.memoryPercent,
        lastDiskPercent: body.diskPercent,
        lastTemperatureCelsius: body.temperatureCelsius ?? null,
        uptimeSeconds: body.uptimeSeconds,
        lastBootId: body.bootId ?? null,
      },
      update: {
        location: body.location,
        ipAddress: body.ipAddress,
        agentVersion: body.agentVersion,
        status: StationStatus.ONLINE,
        serviceStatus: body.serviceStatus,
        lastHeartbeatAt: now,
        lastDataReceivedAt: body.lastCollectionAt ?? undefined,
        lastCpuPercent: body.cpuPercent,
        lastMemoryPercent: body.memoryPercent,
        lastDiskPercent: body.diskPercent,
        lastTemperatureCelsius: body.temperatureCelsius ?? null,
        uptimeSeconds: body.uptimeSeconds,
        lastBootId: body.bootId ?? undefined,
      },
    });

    await prisma.heartbeat.create({
      data: {
        stationId: station.id,
        ipAddress: body.ipAddress,
        agentVersion: body.agentVersion,
        serviceStatus: body.serviceStatus,
        cpuPercent: body.cpuPercent,
        memoryPercent: body.memoryPercent,
        diskPercent: body.diskPercent,
        temperatureCelsius: body.temperatureCelsius ?? null,
        uptimeSeconds: body.uptimeSeconds,
        lastCollectionAt: body.lastCollectionAt ?? null,
        recordsLast24h: body.recordsLast24h,
      },
    });

    await prisma.metric.create({
      data: {
        stationId: station.id,
        cpuPercent: body.cpuPercent,
        memoryPercent: body.memoryPercent,
        diskPercent: body.diskPercent,
        temperatureCelsius: body.temperatureCelsius ?? null,
        uptimeSeconds: body.uptimeSeconds,
      },
    });

    if (body.sensorPayload) {
      const metadata = JSON.parse(JSON.stringify(body.sensorPayload));

      await prisma.event.create({
        data: {
          stationId: station.id,
          severity: 'INFO',
          type: 'SENSOR_PAYLOAD',
          message: 'Leitura ambiental recebida da estação.',
          metadata,
        },
      });
    }

    // Confirma reinicialização física apenas quando a Raspberry retorna com
    // identificador de boot diferente (não confundir com comando enviado).
    if (previous?.lastBootId && body.bootId && previous.lastBootId !== body.bootId) {
      const completed = await prisma.command.updateMany({
        where: { stationId: station.id, type: 'REBOOT_HOST', status: 'RUNNING' },
        data: { status: 'SUCCESS', finishedAt: now, result: 'Novo bootId confirmado em heartbeat' },
      });
      if (completed.count > 0) {
        await prisma.event.create({
          data: { stationId: station.id, severity: 'INFO', type: 'REBOOT_COMPLETED', message: 'Raspberry reiniciou e voltou a comunicar' },
        });
      }
    }

    if (body.serviceStatus !== ServiceStatus.RUNNING && previous?.serviceStatus !== body.serviceStatus) {
      await prisma.event.create({
        data: {
          stationId: station.id,
          severity: 'WARNING',
          type: 'SERVICE_NOT_RUNNING',
          message: `Serviço de coleta está com status ${body.serviceStatus}`,
        },
      });
    }

    reply.code(201);
    return {
      ok: true,
      stationId: station.id,
      receivedAt: now,
      sensorPayloadReceived: Boolean(body.sensorPayload),
    };
  });
}
