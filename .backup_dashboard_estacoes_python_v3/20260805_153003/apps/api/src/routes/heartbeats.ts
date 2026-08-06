import { FastifyInstance } from 'fastify';
import { ServiceStatus, StationStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

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
  lastCollectionAt: z.coerce.date().optional().nullable(),
  recordsLast24h: z.number().int().nonnegative().default(0),
});

export async function heartbeatRoutes(app: FastifyInstance) {
  app.post('/heartbeats', async (request, reply) => {
    const body = heartbeatSchema.parse(request.body);
    const now = new Date();

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
      },
      update: {
        location: body.location,
        latitude: body.latitude ?? undefined,
        longitude: body.longitude ?? undefined,
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

    if (body.serviceStatus !== ServiceStatus.RUNNING) {
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
    return { ok: true, stationId: station.id, receivedAt: now };
  });
}
