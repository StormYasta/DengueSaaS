import { PrismaClient, ServiceStatus, StationStatus } from '@prisma/client';

const prisma = new PrismaClient();

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function createStationWithHistory(input: {
  name: string;
  slug: string;
  location: string;
  ipAddress: string;
  agentVersion: string;
  status: StationStatus;
  serviceStatus: ServiceStatus;
  lastHeartbeatMinutesAgo: number | null;
  lastDataMinutesAgo: number | null;
  baseCpu: number;
  baseMemory: number;
  baseDisk: number;
  baseTemp: number;
  recordsLast24h: number;
}) {
  const lastHeartbeatAt = input.lastHeartbeatMinutesAgo === null ? null : minutesAgo(input.lastHeartbeatMinutesAgo);
  const lastDataReceivedAt = input.lastDataMinutesAgo === null ? null : minutesAgo(input.lastDataMinutesAgo);

  const station = await prisma.station.upsert({
    where: { slug: input.slug },
    update: {
      name: input.name,
      location: input.location,
      ipAddress: input.ipAddress,
      agentVersion: input.agentVersion,
      status: input.status,
      serviceStatus: input.serviceStatus,
      lastHeartbeatAt,
      lastDataReceivedAt,
      lastCpuPercent: input.lastHeartbeatMinutesAgo === null ? null : input.baseCpu,
      lastMemoryPercent: input.lastHeartbeatMinutesAgo === null ? null : input.baseMemory,
      lastDiskPercent: input.lastHeartbeatMinutesAgo === null ? null : input.baseDisk,
      lastTemperatureCelsius: input.lastHeartbeatMinutesAgo === null ? null : input.baseTemp,
      uptimeSeconds: input.lastHeartbeatMinutesAgo === null ? null : 86400 * 3 + Math.floor(Math.random() * 20000),
    },
    create: {
      name: input.name,
      slug: input.slug,
      location: input.location,
      ipAddress: input.ipAddress,
      agentVersion: input.agentVersion,
      status: input.status,
      serviceStatus: input.serviceStatus,
      lastHeartbeatAt,
      lastDataReceivedAt,
      lastCpuPercent: input.lastHeartbeatMinutesAgo === null ? null : input.baseCpu,
      lastMemoryPercent: input.lastHeartbeatMinutesAgo === null ? null : input.baseMemory,
      lastDiskPercent: input.lastHeartbeatMinutesAgo === null ? null : input.baseDisk,
      lastTemperatureCelsius: input.lastHeartbeatMinutesAgo === null ? null : input.baseTemp,
      uptimeSeconds: input.lastHeartbeatMinutesAgo === null ? null : 86400 * 3 + Math.floor(Math.random() * 20000),
    },
  });

  await prisma.metric.deleteMany({ where: { stationId: station.id } });
  await prisma.heartbeat.deleteMany({ where: { stationId: station.id } });
  await prisma.event.deleteMany({ where: { stationId: station.id } });
  await prisma.stationLog.deleteMany({ where: { stationId: station.id } });
  await prisma.command.deleteMany({ where: { stationId: station.id } });

  if (input.lastHeartbeatMinutesAgo !== null) {
    const metricData = Array.from({ length: 48 }).map((_, index) => {
      const point = 47 - index;
      const wave = Math.sin(index / 5);

      return {
        stationId: station.id,
        collectedAt: minutesAgo(point * 30),
        cpuPercent: clamp(input.baseCpu + wave * 8 + (index % 4), 2, 98),
        memoryPercent: clamp(input.baseMemory + wave * 5 + (index % 3), 10, 95),
        diskPercent: clamp(input.baseDisk + index * 0.05, 5, 99),
        temperatureCelsius: clamp(input.baseTemp + wave * 3, 25, 85),
        uptimeSeconds: 86400 * 3 + index * 1800,
      };
    });

    await prisma.metric.createMany({ data: metricData });

    await prisma.heartbeat.create({
      data: {
        stationId: station.id,
        receivedAt: lastHeartbeatAt ?? new Date(),
        ipAddress: input.ipAddress,
        agentVersion: input.agentVersion,
        serviceStatus: input.serviceStatus,
        cpuPercent: input.baseCpu,
        memoryPercent: input.baseMemory,
        diskPercent: input.baseDisk,
        temperatureCelsius: input.baseTemp,
        uptimeSeconds: 86400 * 3,
        lastCollectionAt: lastDataReceivedAt,
        recordsLast24h: input.recordsLast24h,
      },
    });
  }

  return station;
}

async function main() {
  console.log('Limpando dados mock antigos...');

  const stations = await Promise.all([
    createStationWithHistory({
      name: 'E01 - Laboratório FATEC',
      slug: 'E01',
      location: 'FATEC Rio Preto - Laboratório de Pesquisa',
      ipAddress: '192.168.0.21',
      agentVersion: '1.0.0',
      status: StationStatus.ONLINE,
      serviceStatus: ServiceStatus.RUNNING,
      lastHeartbeatMinutesAgo: 1,
      lastDataMinutesAgo: 3,
      baseCpu: 15,
      baseMemory: 42,
      baseDisk: 65,
      baseTemp: 48,
      recordsLast24h: 5234,
    }),
    createStationWithHistory({
      name: 'E02 - Área Externa',
      slug: 'E02',
      location: 'FATEC Rio Preto - Pátio externo',
      ipAddress: '192.168.0.22',
      agentVersion: '1.0.0',
      status: StationStatus.OFFLINE,
      serviceStatus: ServiceStatus.UNKNOWN,
      lastHeartbeatMinutesAgo: 180,
      lastDataMinutesAgo: 190,
      baseCpu: 0,
      baseMemory: 0,
      baseDisk: 72,
      baseTemp: 0,
      recordsLast24h: 1180,
    }),
    createStationWithHistory({
      name: 'E03 - Caixa Protegida',
      slug: 'E03',
      location: 'Estação com abrigo meteorológico',
      ipAddress: '192.168.0.23',
      agentVersion: '1.0.1',
      status: StationStatus.WARNING,
      serviceStatus: ServiceStatus.FAILED,
      lastHeartbeatMinutesAgo: 2,
      lastDataMinutesAgo: 95,
      baseCpu: 31,
      baseMemory: 58,
      baseDisk: 81,
      baseTemp: 52,
      recordsLast24h: 2104,
    }),
    createStationWithHistory({
      name: 'E04 - Telhado Bloco B',
      slug: 'E04',
      location: 'Telhado do Bloco B',
      ipAddress: '192.168.0.24',
      agentVersion: '1.0.1',
      status: StationStatus.WARNING,
      serviceStatus: ServiceStatus.RUNNING,
      lastHeartbeatMinutesAgo: 1,
      lastDataMinutesAgo: 8,
      baseCpu: 78,
      baseMemory: 76,
      baseDisk: 91,
      baseTemp: 68,
      recordsLast24h: 4870,
    }),
    createStationWithHistory({
      name: 'E05 - Jardim Experimental',
      slug: 'E05',
      location: 'Jardim experimental de sensores',
      ipAddress: '192.168.0.25',
      agentVersion: '0.9.8',
      status: StationStatus.OFFLINE,
      serviceStatus: ServiceStatus.STOPPED,
      lastHeartbeatMinutesAgo: null,
      lastDataMinutesAgo: null,
      baseCpu: 0,
      baseMemory: 0,
      baseDisk: 0,
      baseTemp: 0,
      recordsLast24h: 0,
    }),
  ]);

  const [e01, e02, e03, e04, e05] = stations;

  await prisma.event.createMany({
    data: [
      { stationId: e01.id, severity: 'INFO', type: 'HEARTBEAT_RECEIVED', message: 'Estação operando normalmente.', createdAt: minutesAgo(1) },
      { stationId: e02.id, severity: 'CRITICAL', type: 'STATION_OFFLINE', message: 'Estação sem heartbeat há mais de 2 horas.', createdAt: hoursAgo(2) },
      { stationId: e03.id, severity: 'ERROR', type: 'SERVICE_FAILED', message: 'Serviço de coleta Python falhou no systemd.', createdAt: minutesAgo(95) },
      { stationId: e03.id, severity: 'WARNING', type: 'NO_DATA_TRANSMISSION', message: 'Sem transmissão de dados climáticos há mais de 90 minutos.', createdAt: minutesAgo(90) },
      { stationId: e04.id, severity: 'WARNING', type: 'HIGH_TEMPERATURE', message: 'Temperatura da Raspberry acima do limite recomendado.', createdAt: minutesAgo(12) },
      { stationId: e04.id, severity: 'WARNING', type: 'DISK_USAGE_HIGH', message: 'Uso de disco acima de 90%.', createdAt: minutesAgo(18) },
      { stationId: e05.id, severity: 'CRITICAL', type: 'NEVER_CONNECTED', message: 'Estação cadastrada, mas sem primeiro heartbeat recebido.', createdAt: hoursAgo(8) },
    ],
  });

  await prisma.stationLog.createMany({
    data: [
      { stationId: e01.id, level: 'INFO', source: 'collector', message: 'Coleta realizada com sucesso.', occurredAt: minutesAgo(3) },
      { stationId: e02.id, level: 'ERROR', source: 'agent', message: 'Falha ao conectar com a API central antes de ficar offline.', occurredAt: hoursAgo(3) },
      { stationId: e03.id, level: 'ERROR', source: 'collector', message: 'Timeout de leitura no sensor DHT22.', occurredAt: minutesAgo(96) },
      { stationId: e03.id, level: 'INFO', source: 'systemd', message: 'Tentativa de reinício automático do serviço.', occurredAt: minutesAgo(94) },
      { stationId: e04.id, level: 'WARNING', source: 'agent', message: 'Temperatura elevada detectada durante heartbeat.', occurredAt: minutesAgo(12) },
      { stationId: e04.id, level: 'WARNING', source: 'storage', message: 'Diretório de logs consumindo espaço excessivo.', occurredAt: minutesAgo(18) },
      { stationId: e05.id, level: 'INFO', source: 'admin', message: 'Estação cadastrada para instalação em campo.', occurredAt: hoursAgo(8) },
    ],
  });

  await prisma.command.createMany({
    data: [
      { stationId: e03.id, type: 'restart_service', status: 'PENDING', requestedBy: 'admin@demo.local', payload: { serviceName: 'coletor-clima.service' } },
      { stationId: e04.id, type: 'cleanup_logs', status: 'PENDING', requestedBy: 'admin@demo.local', payload: { path: '/var/log/dengue-saas' } },
    ],
  });

  console.log('Seed finalizado com sucesso.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
