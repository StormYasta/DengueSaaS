import { PrismaClient, ServiceStatus, StationStatus } from '@prisma/client';

const prisma = new PrismaClient();

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const presentationStations = [
  {
    name: 'FATEC Rio Preto / Eldorado',
    slug: 'E01',
    location: 'Jardim Eldorado - Estação piloto instalada na FATEC',
    description: 'Estação real/piloto usada como referência para a apresentação.',
    latitude: -20.8339,
    longitude: -49.39999,
    ipAddress: '192.168.58.41',
    agentVersion: '1.1.0',
    status: StationStatus.ONLINE,
    serviceStatus: ServiceStatus.RUNNING,
    lastHeartbeatMinutesAgo: 1,
    lastDataMinutesAgo: 2,
    baseCpu: 14,
    baseMemory: 39,
    baseDisk: 58,
    baseTemp: 41,
    recordsLast24h: 96,
  },
  {
    name: 'UBS Central / Boa Vista',
    slug: 'E02',
    location: 'Região central - Boa Vista',
    description: 'Ponto demonstrativo de operação em unidade de saúde central.',
    latitude: -20.8126,
    longitude: -49.3762,
    ipAddress: '192.168.58.42',
    agentVersion: '1.1.0',
    status: StationStatus.ONLINE,
    serviceStatus: ServiceStatus.RUNNING,
    lastHeartbeatMinutesAgo: 3,
    lastDataMinutesAgo: 5,
    baseCpu: 22,
    baseMemory: 46,
    baseDisk: 61,
    baseTemp: 45,
    recordsLast24h: 94,
  },
  {
    name: 'UBS Solo Sagrado',
    slug: 'E03',
    location: 'Zona Norte - Solo Sagrado',
    description: 'Mock de estação sem comunicação recente.',
    latitude: -20.7795,
    longitude: -49.3855,
    ipAddress: '192.168.58.43',
    agentVersion: '1.0.9',
    status: StationStatus.OFFLINE,
    serviceStatus: ServiceStatus.UNKNOWN,
    lastHeartbeatMinutesAgo: 190,
    lastDataMinutesAgo: 205,
    baseCpu: 6,
    baseMemory: 34,
    baseDisk: 70,
    baseTemp: 36,
    recordsLast24h: 42,
  },
  {
    name: 'UBS Eldorado',
    slug: 'E04',
    location: 'Jardim Eldorado',
    description: 'Mock com falha no serviço de coleta.',
    latitude: -20.8327,
    longitude: -49.3974,
    ipAddress: '192.168.58.44',
    agentVersion: '1.1.0',
    status: StationStatus.WARNING,
    serviceStatus: ServiceStatus.FAILED,
    lastHeartbeatMinutesAgo: 4,
    lastDataMinutesAgo: 96,
    baseCpu: 31,
    baseMemory: 63,
    baseDisk: 82,
    baseTemp: 52,
    recordsLast24h: 61,
  },
  {
    name: 'UBS São Deocleciano',
    slug: 'E05',
    location: 'Zona Leste - São Deocleciano',
    description: 'Mock com temperatura e disco em atenção.',
    latitude: -20.8069,
    longitude: -49.3386,
    ipAddress: '192.168.58.45',
    agentVersion: '1.1.0',
    status: StationStatus.WARNING,
    serviceStatus: ServiceStatus.RUNNING,
    lastHeartbeatMinutesAgo: 2,
    lastDataMinutesAgo: 8,
    baseCpu: 74,
    baseMemory: 72,
    baseDisk: 91,
    baseTemp: 69,
    recordsLast24h: 89,
  },
  {
    name: 'UBS Vila Toninho',
    slug: 'E06',
    location: 'Zona Sul - Vila Toninho',
    description: 'Mock saudável para cobertura territorial.',
    latitude: -20.8594,
    longitude: -49.3568,
    ipAddress: '192.168.58.46',
    agentVersion: '1.1.0',
    status: StationStatus.ONLINE,
    serviceStatus: ServiceStatus.RUNNING,
    lastHeartbeatMinutesAgo: 5,
    lastDataMinutesAgo: 7,
    baseCpu: 18,
    baseMemory: 44,
    baseDisk: 49,
    baseTemp: 43,
    recordsLast24h: 93,
  },
  {
    name: 'UBS Jaguaré',
    slug: 'E07',
    location: 'Região Oeste - Jaguaré',
    description: 'Mock saudável com boa estabilidade.',
    latitude: -20.8001,
    longitude: -49.4218,
    ipAddress: '192.168.58.47',
    agentVersion: '1.1.0',
    status: StationStatus.ONLINE,
    serviceStatus: ServiceStatus.RUNNING,
    lastHeartbeatMinutesAgo: 1,
    lastDataMinutesAgo: 4,
    baseCpu: 25,
    baseMemory: 51,
    baseDisk: 54,
    baseTemp: 46,
    recordsLast24h: 96,
  },
  {
    name: 'UBS Santo Antônio',
    slug: 'E08',
    location: 'Região Norte - Santo Antônio',
    description: 'Mock offline para demonstrar alerta crítico.',
    latitude: -20.7684,
    longitude: -49.3586,
    ipAddress: '192.168.58.48',
    agentVersion: '1.0.8',
    status: StationStatus.OFFLINE,
    serviceStatus: ServiceStatus.STOPPED,
    lastHeartbeatMinutesAgo: 260,
    lastDataMinutesAgo: 275,
    baseCpu: 4,
    baseMemory: 28,
    baseDisk: 66,
    baseTemp: 33,
    recordsLast24h: 25,
  },
  {
    name: 'UBS Estoril',
    slug: 'E09',
    location: 'Zona Sul - Estoril',
    description: 'Mock saudável em área urbana consolidada.',
    latitude: -20.8383,
    longitude: -49.3789,
    ipAddress: '192.168.58.49',
    agentVersion: '1.1.0',
    status: StationStatus.ONLINE,
    serviceStatus: ServiceStatus.RUNNING,
    lastHeartbeatMinutesAgo: 2,
    lastDataMinutesAgo: 3,
    baseCpu: 16,
    baseMemory: 41,
    baseDisk: 47,
    baseTemp: 44,
    recordsLast24h: 95,
  },
  {
    name: 'UBS Engenheiro Schmitt',
    slug: 'E10',
    location: 'Distrito de Engenheiro Schmitt',
    description: 'Mock com atraso de transmissão de dados climáticos.',
    latitude: -20.7769,
    longitude: -49.2811,
    ipAddress: '192.168.58.50',
    agentVersion: '1.1.0',
    status: StationStatus.WARNING,
    serviceStatus: ServiceStatus.RUNNING,
    lastHeartbeatMinutesAgo: 6,
    lastDataMinutesAgo: 72,
    baseCpu: 29,
    baseMemory: 56,
    baseDisk: 77,
    baseTemp: 50,
    recordsLast24h: 68,
  },
];

async function clearStationHistory(stationId) {
  await prisma.command.deleteMany({ where: { stationId } });
  await prisma.stationLog.deleteMany({ where: { stationId } });
  await prisma.event.deleteMany({ where: { stationId } });
  await prisma.metric.deleteMany({ where: { stationId } });
  await prisma.heartbeat.deleteMany({ where: { stationId } });
}

async function upsertStationWithHistory(input) {
  const lastHeartbeatAt = input.lastHeartbeatMinutesAgo === null ? null : minutesAgo(input.lastHeartbeatMinutesAgo);
  const lastDataReceivedAt = input.lastDataMinutesAgo === null ? null : minutesAgo(input.lastDataMinutesAgo);
  const uptimeSeconds = 86400 * 4 + Math.floor(Math.random() * 42000);

  const station = await prisma.station.upsert({
    where: { slug: input.slug },
    update: {
      name: input.name,
      location: input.location,
      description: input.description,
      latitude: input.latitude,
      longitude: input.longitude,
      ipAddress: input.ipAddress,
      agentVersion: input.agentVersion,
      status: input.status,
      serviceStatus: input.serviceStatus,
      lastHeartbeatAt,
      lastDataReceivedAt,
      lastCpuPercent: input.baseCpu,
      lastMemoryPercent: input.baseMemory,
      lastDiskPercent: input.baseDisk,
      lastTemperatureCelsius: input.baseTemp,
      uptimeSeconds,
    },
    create: {
      name: input.name,
      slug: input.slug,
      location: input.location,
      description: input.description,
      latitude: input.latitude,
      longitude: input.longitude,
      ipAddress: input.ipAddress,
      agentVersion: input.agentVersion,
      status: input.status,
      serviceStatus: input.serviceStatus,
      lastHeartbeatAt,
      lastDataReceivedAt,
      lastCpuPercent: input.baseCpu,
      lastMemoryPercent: input.baseMemory,
      lastDiskPercent: input.baseDisk,
      lastTemperatureCelsius: input.baseTemp,
      uptimeSeconds,
    },
  });

  await clearStationHistory(station.id);

  if (lastHeartbeatAt) {
    const metricData = Array.from({ length: 48 }).map((_, index) => {
      const minutesBack = (47 - index) * 30;
      const wave = Math.sin(index / 5);
      const jitter = (index % 5) - 2;

      return {
        stationId: station.id,
        collectedAt: minutesAgo(minutesBack),
        cpuPercent: clamp(input.baseCpu + wave * 8 + jitter, 1, 98),
        memoryPercent: clamp(input.baseMemory + wave * 5 + jitter, 10, 96),
        diskPercent: clamp(input.baseDisk + index * 0.04, 5, 99),
        temperatureCelsius: clamp(input.baseTemp + wave * 3, 25, 86),
        uptimeSeconds: uptimeSeconds - minutesBack * 60,
      };
    });

    await prisma.metric.createMany({ data: metricData });

    await prisma.heartbeat.create({
      data: {
        stationId: station.id,
        receivedAt: lastHeartbeatAt,
        ipAddress: input.ipAddress,
        agentVersion: input.agentVersion,
        serviceStatus: input.serviceStatus,
        cpuPercent: input.baseCpu,
        memoryPercent: input.baseMemory,
        diskPercent: input.baseDisk,
        temperatureCelsius: input.baseTemp,
        uptimeSeconds,
        lastCollectionAt: lastDataReceivedAt,
        recordsLast24h: input.recordsLast24h,
      },
    });
  }

  return station;
}

async function seedPresentation() {
  console.log('Gerando estações mock para apresentação...');

  const stations = [];
  for (const stationInput of presentationStations) {
    const station = await upsertStationWithHistory(stationInput);
    stations.push(station);
    console.log(`OK ${stationInput.slug} - ${stationInput.name}`);
  }

  const bySlug = Object.fromEntries(stations.map((station) => [station.slug, station]));

  await prisma.event.createMany({
    data: [
      { stationId: bySlug.E01.id, severity: 'INFO', type: 'HEARTBEAT_RECEIVED', message: 'Estação piloto FATEC operando normalmente.', createdAt: minutesAgo(1) },
      { stationId: bySlug.E02.id, severity: 'INFO', type: 'HEARTBEAT_RECEIVED', message: 'Estação central online e transmitindo.', createdAt: minutesAgo(3) },
      { stationId: bySlug.E03.id, severity: 'CRITICAL', type: 'STATION_OFFLINE', message: 'Estação sem heartbeat há mais de 3 horas.', createdAt: minutesAgo(190) },
      { stationId: bySlug.E04.id, severity: 'ERROR', type: 'SERVICE_FAILED', message: 'Serviço de coleta Python falhou no systemd.', createdAt: minutesAgo(96) },
      { stationId: bySlug.E05.id, severity: 'WARNING', type: 'HIGH_TEMPERATURE', message: 'Temperatura da Raspberry acima do limite recomendado.', createdAt: minutesAgo(12) },
      { stationId: bySlug.E05.id, severity: 'WARNING', type: 'DISK_USAGE_HIGH', message: 'Uso de disco acima de 90%.', createdAt: minutesAgo(18) },
      { stationId: bySlug.E08.id, severity: 'CRITICAL', type: 'STATION_OFFLINE', message: 'Estação sem comunicação há mais de 4 horas.', createdAt: minutesAgo(260) },
      { stationId: bySlug.E10.id, severity: 'WARNING', type: 'NO_DATA_TRANSMISSION', message: 'Sem transmissão de dados climáticos há mais de 70 minutos.', createdAt: minutesAgo(72) },
    ],
  });

  await prisma.stationLog.createMany({
    data: [
      { stationId: bySlug.E01.id, level: 'INFO', source: 'collector', message: 'Coleta realizada com sucesso.', occurredAt: minutesAgo(2) },
      { stationId: bySlug.E02.id, level: 'INFO', source: 'agent', message: 'Heartbeat enviado para o SaaS.', occurredAt: minutesAgo(3) },
      { stationId: bySlug.E03.id, level: 'ERROR', source: 'network', message: 'Falha ao conectar com a API central antes de ficar offline.', occurredAt: minutesAgo(190) },
      { stationId: bySlug.E04.id, level: 'ERROR', source: 'systemd', message: 'Serviço de coleta encerrado com código diferente de zero.', occurredAt: minutesAgo(96) },
      { stationId: bySlug.E05.id, level: 'WARNING', source: 'agent', message: 'Temperatura elevada detectada durante heartbeat.', occurredAt: minutesAgo(12) },
      { stationId: bySlug.E08.id, level: 'ERROR', source: 'agent', message: 'Sem rota para a rede central.', occurredAt: minutesAgo(260) },
      { stationId: bySlug.E10.id, level: 'WARNING', source: 'collector', message: 'Arquivo CSV local atualizado, mas sem envio climático recente.', occurredAt: minutesAgo(72) },
    ],
  });

  await prisma.command.createMany({
    data: [
      { stationId: bySlug.E04.id, type: 'restart_service', status: 'PENDING', requestedBy: 'demo@noryn.local', payload: { serviceName: 'estacao.service' } },
      { stationId: bySlug.E05.id, type: 'cleanup_logs', status: 'PENDING', requestedBy: 'demo@noryn.local', payload: { path: '/var/log/dengue-saas' } },
      { stationId: bySlug.E08.id, type: 'network_diagnostic', status: 'PENDING', requestedBy: 'demo@noryn.local', payload: { target: 'api-central' } },
    ],
  });

  console.log('Seed de apresentação finalizado com sucesso.');
}

seedPresentation()
  .catch((error) => {
    console.error('Erro ao gerar dados mock de apresentação:');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
