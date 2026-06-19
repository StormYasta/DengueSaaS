import { FastifyInstance } from 'fastify';
import { z } from 'zod';

type StationStatus = 'ONLINE' | 'OFFLINE' | 'WARNING';
type ComputedStatus = 'ONLINE' | 'OFFLINE';
type ServiceStatus = 'RUNNING' | 'STOPPED' | 'FAILED' | 'UNKNOWN';
type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

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
  severity: Severity;
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

type Station = {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  description?: string | null;
  latitude: number | null;
  longitude: number | null;
  ipAddress: string | null;
  agentVersion: string | null;
  status: StationStatus;
  computedStatus: ComputedStatus;
  serviceStatus: ServiceStatus;
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

type StationInput = Omit<Station, 'secondsSinceHeartbeat' | 'secondsSinceLastData' | 'metrics' | 'events' | 'logs' | 'commands'> & {
  baseCpu?: number;
  baseRam?: number;
  baseDisk?: number;
  baseTemp?: number;
  events?: Event[];
  logs?: StationLog[];
  commands?: Command[];
};

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function secondsSince(date?: string | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function metricHistory(slug: string, baseCpu: number, baseRam: number, baseDisk: number, baseTemp: number): Metric[] {
  return Array.from({ length: 48 }).map((_, index) => {
    const point = 47 - index;
    const wave = Math.sin(index / 5);

    return {
      id: `metric-${slug}-${index}`,
      collectedAt: minutesAgo(point * 30),
      cpuPercent: clamp(baseCpu + wave * 8 + (index % 4), 2, 98),
      memoryPercent: clamp(baseRam + wave * 5 + (index % 3), 10, 95),
      diskPercent: clamp(baseDisk + index * 0.05, 5, 99),
      temperatureCelsius: clamp(baseTemp + wave * 3, 25, 85),
      uptimeSeconds: 86400 * 3 + index * 1800,
    };
  });
}

function makeEvent(slug: string, severity: Severity, type: string, message: string, minutes: number): Event {
  return { id: `evt-${slug}-${type}`, severity, type, message, createdAt: minutesAgo(minutes) };
}

function makeLog(slug: string, level: string, source: string, message: string, minutes: number): StationLog {
  return { id: `log-${slug}-${source}-${minutes}`, level, source, message, occurredAt: minutesAgo(minutes) };
}

function makeStation(input: StationInput): Station {
  return {
    ...input,
    secondsSinceHeartbeat: secondsSince(input.lastHeartbeatAt),
    secondsSinceLastData: secondsSince(input.lastDataReceivedAt),
    metrics: input.lastHeartbeatAt ? metricHistory(input.slug, input.baseCpu ?? 0, input.baseRam ?? 0, input.baseDisk ?? 0, input.baseTemp ?? 0) : [],
    events: input.events ?? [],
    logs: input.logs ?? [],
    commands: input.commands ?? [],
  };
}

let stations: Station[] = [
  makeStation({
    id: 'demo-e01', name: 'E01 - UBS Central / Boa Vista', slug: 'E01', location: 'Referência territorial: região central', latitude: -20.8126, longitude: -49.3762,
    ipAddress: '192.168.0.21', agentVersion: '1.0.1', status: 'ONLINE', computedStatus: 'ONLINE', serviceStatus: 'RUNNING', lastHeartbeatAt: minutesAgo(1), lastDataReceivedAt: minutesAgo(3),
    lastCpuPercent: 15, lastMemoryPercent: 42, lastDiskPercent: 65, lastTemperatureCelsius: 48, uptimeSeconds: 278912, baseCpu: 15, baseRam: 42, baseDisk: 65, baseTemp: 48,
    events: [makeEvent('E01', 'INFO', 'HEALTHY', 'Estação operando normalmente.', 1)],
    logs: [makeLog('E01', 'INFO', 'collector', 'Coleta realizada com sucesso.', 3)],
  }),
  makeStation({
    id: 'demo-e02', name: 'E02 - UBS Solo Sagrado', slug: 'E02', location: 'Referência territorial: zona norte / Solo Sagrado', latitude: -20.7795, longitude: -49.3855,
    ipAddress: '192.168.0.22', agentVersion: '1.0.0', status: 'OFFLINE', computedStatus: 'OFFLINE', serviceStatus: 'UNKNOWN', lastHeartbeatAt: minutesAgo(180), lastDataReceivedAt: minutesAgo(190),
    lastCpuPercent: 0, lastMemoryPercent: 0, lastDiskPercent: 72, lastTemperatureCelsius: 0, uptimeSeconds: null, baseCpu: 8, baseRam: 36, baseDisk: 72, baseTemp: 44,
    events: [makeEvent('E02', 'CRITICAL', 'STATION_OFFLINE', 'Estação sem heartbeat há mais de 2 horas.', 120)],
    logs: [makeLog('E02', 'ERROR', 'agent', 'Falha ao conectar com a API central antes de ficar offline.', 180)],
  }),
  makeStation({
    id: 'demo-e03', name: 'E03 - UBS Eldorado', slug: 'E03', location: 'Referência territorial: Eldorado', latitude: -20.7975, longitude: -49.3420,
    ipAddress: '192.168.0.23', agentVersion: '1.0.1', status: 'WARNING', computedStatus: 'ONLINE', serviceStatus: 'FAILED', lastHeartbeatAt: minutesAgo(2), lastDataReceivedAt: minutesAgo(95),
    lastCpuPercent: 31, lastMemoryPercent: 58, lastDiskPercent: 81, lastTemperatureCelsius: 52, uptimeSeconds: 301552, baseCpu: 31, baseRam: 58, baseDisk: 81, baseTemp: 52,
    events: [
      makeEvent('E03', 'ERROR', 'SERVICE_FAILED', 'Serviço de coleta Python falhou no systemd.', 95),
      makeEvent('E03', 'WARNING', 'NO_DATA_TRANSMISSION', 'Sem transmissão de dados climáticos há mais de 90 minutos.', 90),
    ],
    logs: [
      makeLog('E03', 'ERROR', 'collector', 'Timeout de leitura no sensor DHT22.', 96),
      makeLog('E03', 'INFO', 'systemd', 'Tentativa de reinício automático do serviço.', 94),
    ],
    commands: [{ id: 'cmd-e03-1', type: 'restart_service', status: 'PENDING', requestedBy: 'admin@demo.local', requestedAt: minutesAgo(10), payload: { serviceName: 'coletor-clima.service' } }],
  }),
  makeStation({
    id: 'demo-e04', name: 'E04 - UBS São Deocleciano', slug: 'E04', location: 'Referência territorial: região oeste / São Deocleciano', latitude: -20.8190, longitude: -49.4220,
    ipAddress: '192.168.0.24', agentVersion: '1.0.1', status: 'WARNING', computedStatus: 'ONLINE', serviceStatus: 'RUNNING', lastHeartbeatAt: minutesAgo(1), lastDataReceivedAt: minutesAgo(8),
    lastCpuPercent: 78, lastMemoryPercent: 76, lastDiskPercent: 91, lastTemperatureCelsius: 68, uptimeSeconds: 296102, baseCpu: 78, baseRam: 76, baseDisk: 91, baseTemp: 68,
    events: [
      makeEvent('E04', 'WARNING', 'HIGH_TEMPERATURE', 'Temperatura da Raspberry acima do limite recomendado.', 12),
      makeEvent('E04', 'WARNING', 'DISK_USAGE_HIGH', 'Uso de disco acima de 90%.', 18),
    ],
    logs: [
      makeLog('E04', 'WARNING', 'agent', 'Temperatura elevada detectada durante heartbeat.', 12),
      makeLog('E04', 'WARNING', 'storage', 'Diretório de logs consumindo espaço excessivo.', 18),
    ],
  }),
  makeStation({
    id: 'demo-e05', name: 'E05 - UBS Vila Toninho', slug: 'E05', location: 'Referência territorial: zona sul / Vila Toninho', latitude: -20.8580, longitude: -49.3860,
    ipAddress: '192.168.0.25', agentVersion: '1.0.0', status: 'ONLINE', computedStatus: 'ONLINE', serviceStatus: 'RUNNING', lastHeartbeatAt: minutesAgo(1), lastDataReceivedAt: minutesAgo(5),
    lastCpuPercent: 22, lastMemoryPercent: 48, lastDiskPercent: 54, lastTemperatureCelsius: 46, uptimeSeconds: 220010, baseCpu: 22, baseRam: 48, baseDisk: 54, baseTemp: 46,
    events: [makeEvent('E05', 'INFO', 'HEALTHY', 'Estação transmitindo dados normalmente.', 5)],
    logs: [makeLog('E05', 'INFO', 'collector', 'Pacote climático enviado para a API.', 5)],
  }),
  makeStation({
    id: 'demo-e06', name: 'E06 - UBS Jaguaré', slug: 'E06', location: 'Referência territorial: região leste / Jaguaré', latitude: -20.8330, longitude: -49.3310,
    ipAddress: '192.168.0.26', agentVersion: '1.0.1', status: 'ONLINE', computedStatus: 'ONLINE', serviceStatus: 'RUNNING', lastHeartbeatAt: minutesAgo(1), lastDataReceivedAt: minutesAgo(2),
    lastCpuPercent: 18, lastMemoryPercent: 39, lastDiskPercent: 49, lastTemperatureCelsius: 43, uptimeSeconds: 310510, baseCpu: 18, baseRam: 39, baseDisk: 49, baseTemp: 43,
    events: [makeEvent('E06', 'INFO', 'HEALTHY', 'Sensores operando dentro do esperado.', 2)],
    logs: [makeLog('E06', 'INFO', 'collector', 'Leitura de temperatura e umidade concluída.', 2)],
  }),
  makeStation({
    id: 'demo-e07', name: 'E07 - UBS Santo Antônio', slug: 'E07', location: 'Referência territorial: extremo oeste / Santo Antônio', latitude: -20.7910, longitude: -49.4490,
    ipAddress: '192.168.0.27', agentVersion: '1.0.0', status: 'OFFLINE', computedStatus: 'OFFLINE', serviceStatus: 'STOPPED', lastHeartbeatAt: minutesAgo(75), lastDataReceivedAt: minutesAgo(80),
    lastCpuPercent: 11, lastMemoryPercent: 41, lastDiskPercent: 59, lastTemperatureCelsius: 47, uptimeSeconds: null, baseCpu: 11, baseRam: 41, baseDisk: 59, baseTemp: 47,
    events: [makeEvent('E07', 'CRITICAL', 'STATION_OFFLINE', 'Estação sem comunicação há mais de 1 hora.', 75)],
    logs: [makeLog('E07', 'ERROR', 'network', 'Perda de conectividade com a rede local.', 76)],
  }),
  makeStation({
    id: 'demo-e08', name: 'E08 - UBS Estoril', slug: 'E08', location: 'Referência territorial: Estoril / região hospitalar', latitude: -20.8350, longitude: -49.3690,
    ipAddress: '192.168.0.28', agentVersion: '1.0.2', status: 'ONLINE', computedStatus: 'ONLINE', serviceStatus: 'RUNNING', lastHeartbeatAt: minutesAgo(1), lastDataReceivedAt: minutesAgo(4),
    lastCpuPercent: 26, lastMemoryPercent: 52, lastDiskPercent: 62, lastTemperatureCelsius: 50, uptimeSeconds: 188910, baseCpu: 26, baseRam: 52, baseDisk: 62, baseTemp: 50,
    events: [makeEvent('E08', 'INFO', 'HEALTHY', 'Heartbeat recebido com métricas estáveis.', 1)],
    logs: [makeLog('E08', 'INFO', 'agent', 'Heartbeat enviado com sucesso.', 1)],
  }),
  makeStation({
    id: 'demo-e09', name: 'E09 - UBS Engenheiro Schmitt', slug: 'E09', location: 'Referência territorial: distrito de Engenheiro Schmitt', latitude: -20.8750, longitude: -49.3220,
    ipAddress: '192.168.0.29', agentVersion: '1.0.1', status: 'WARNING', computedStatus: 'ONLINE', serviceStatus: 'RUNNING', lastHeartbeatAt: minutesAgo(2), lastDataReceivedAt: minutesAgo(40),
    lastCpuPercent: 34, lastMemoryPercent: 57, lastDiskPercent: 88, lastTemperatureCelsius: 55, uptimeSeconds: 154400, baseCpu: 34, baseRam: 57, baseDisk: 88, baseTemp: 55,
    events: [makeEvent('E09', 'WARNING', 'DATA_DELAY', 'Transmissão de dados climáticos atrasada há 40 minutos.', 40)],
    logs: [makeLog('E09', 'WARNING', 'collector', 'Fila local acumulando leituras para reenvio.', 40)],
  }),
  makeStation({
    id: 'demo-e10', name: 'E10 - UBS Talhado', slug: 'E10', location: 'Referência territorial: distrito de Talhado', latitude: -20.7650, longitude: -49.4200,
    ipAddress: '192.168.0.30', agentVersion: '1.0.0', status: 'ONLINE', computedStatus: 'ONLINE', serviceStatus: 'RUNNING', lastHeartbeatAt: minutesAgo(1), lastDataReceivedAt: minutesAgo(6),
    lastCpuPercent: 19, lastMemoryPercent: 44, lastDiskPercent: 57, lastTemperatureCelsius: 45, uptimeSeconds: 265200, baseCpu: 19, baseRam: 44, baseDisk: 57, baseTemp: 45,
    events: [makeEvent('E10', 'INFO', 'HEALTHY', 'Estação rural monitorando normalmente.', 6)],
    logs: [makeLog('E10', 'INFO', 'collector', 'Leituras ambientais transmitidas.', 6)],
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
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }).parse(request.body);

    const station = makeStation({
      id: `demo-${body.slug.toLowerCase()}`,
      name: body.name,
      slug: body.slug,
      location: body.location ?? null,
      description: body.description ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
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
      latitude: z.number().optional().nullable(),
      longitude: z.number().optional().nullable(),
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
        latitude: body.latitude ?? current.latitude,
        longitude: body.longitude ?? current.longitude,
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
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
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
