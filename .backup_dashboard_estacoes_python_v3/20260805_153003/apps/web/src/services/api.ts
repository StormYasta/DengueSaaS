const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333/api';
const LOCAL_PRESENTATION_MODE = import.meta.env.VITE_LOCAL_PRESENTATION === 'true';
const STORAGE_KEY = 'dengue-saas-presentation-data-v1';

export type Station = {
  id: string;
  name: string;
  slug: string;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  ipAddress?: string | null;
  agentVersion?: string | null;
  computedStatus: 'ONLINE' | 'OFFLINE';
  serviceStatus: 'RUNNING' | 'STOPPED' | 'FAILED' | 'UNKNOWN';
  lastHeartbeatAt?: string | null;
  lastDataReceivedAt?: string | null;
  lastCpuPercent?: number | null;
  lastMemoryPercent?: number | null;
  lastDiskPercent?: number | null;
  lastTemperatureCelsius?: number | null;
  uptimeSeconds?: number | null;
  secondsSinceHeartbeat?: number | null;
  secondsSinceLastData?: number | null;
};

export type DashboardResponse = {
  summary: {
    totalStations: number;
    onlineCount: number;
    offlineCount: number;
    serviceProblems: number;
  };
  stations: Station[];
};

export type Metric = {
  id: string;
  collectedAt: string;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  temperatureCelsius?: number | null;
  uptimeSeconds?: number | null;
};

export type StationDetail = Station & {
  metrics: Metric[];
  events: Array<{ id: string; severity: string; type: string; message: string; createdAt: string }>;
  logs: Array<{ id: string; level: string; message: string; source?: string | null; occurredAt: string }>;
};

type LocalData = {
  stations: StationDetail[];
};

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function metricHistory(stationId: string, baseCpu: number, baseMemory: number, baseDisk: number, baseTemp: number): Metric[] {
  return Array.from({ length: 48 }).map((_, index) => {
    const point = 47 - index;
    const wave = Math.sin(index / 5);
    const jitter = (index % 5) - 2;

    return {
      id: `${stationId}-metric-${index}`,
      collectedAt: minutesAgo(point * 30),
      cpuPercent: clamp(baseCpu + wave * 8 + jitter, 1, 98),
      memoryPercent: clamp(baseMemory + wave * 5 + jitter, 10, 96),
      diskPercent: clamp(baseDisk + index * 0.04, 5, 99),
      temperatureCelsius: clamp(baseTemp + wave * 3, 25, 86),
      uptimeSeconds: 86400 * 4 + index * 1800,
    };
  });
}

function createStation(input: {
  id: string;
  name: string;
  slug: string;
  location: string;
  latitude: number;
  longitude: number;
  ipAddress: string;
  agentVersion: string;
  computedStatus: 'ONLINE' | 'OFFLINE';
  serviceStatus: 'RUNNING' | 'STOPPED' | 'FAILED' | 'UNKNOWN';
  heartbeatAgo: number | null;
  dataAgo: number | null;
  cpu: number;
  memory: number;
  disk: number;
  temp: number;
  events: StationDetail['events'];
  logs: StationDetail['logs'];
}): StationDetail {
  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    location: input.location,
    latitude: input.latitude,
    longitude: input.longitude,
    ipAddress: input.ipAddress,
    agentVersion: input.agentVersion,
    computedStatus: input.computedStatus,
    serviceStatus: input.serviceStatus,
    lastHeartbeatAt: input.heartbeatAgo === null ? null : minutesAgo(input.heartbeatAgo),
    lastDataReceivedAt: input.dataAgo === null ? null : minutesAgo(input.dataAgo),
    lastCpuPercent: input.cpu,
    lastMemoryPercent: input.memory,
    lastDiskPercent: input.disk,
    lastTemperatureCelsius: input.temp,
    uptimeSeconds: input.heartbeatAgo === null ? null : 86400 * 4 + Math.floor(Math.random() * 42000),
    secondsSinceHeartbeat: input.heartbeatAgo === null ? null : input.heartbeatAgo * 60,
    secondsSinceLastData: input.dataAgo === null ? null : input.dataAgo * 60,
    metrics: metricHistory(input.id, input.cpu, input.memory, input.disk, input.temp),
    events: input.events,
    logs: input.logs,
  };
}

function createPresentationData(): LocalData {
  const stations: StationDetail[] = [
    createStation({
      id: 'local-e01',
      name: 'FATEC Rio Preto / Eldorado',
      slug: 'E01',
      location: 'Jardim Eldorado - Estação piloto instalada na FATEC',
      latitude: -20.8339,
      longitude: -49.39999,
      ipAddress: '192.168.58.41',
      agentVersion: '1.1.0',
      computedStatus: 'ONLINE',
      serviceStatus: 'RUNNING',
      heartbeatAgo: 1,
      dataAgo: 2,
      cpu: 14,
      memory: 39,
      disk: 58,
      temp: 41,
      events: [{ id: 'e01-event-1', severity: 'INFO', type: 'HEARTBEAT_RECEIVED', message: 'Estação piloto FATEC operando normalmente.', createdAt: minutesAgo(1) }],
      logs: [{ id: 'e01-log-1', level: 'INFO', source: 'collector', message: 'Coleta realizada com sucesso.', occurredAt: minutesAgo(2) }],
    }),
    createStation({
      id: 'local-e02',
      name: 'UBS Central / Boa Vista',
      slug: 'E02',
      location: 'Região central - Boa Vista',
      latitude: -20.8126,
      longitude: -49.3762,
      ipAddress: '192.168.58.42',
      agentVersion: '1.1.0',
      computedStatus: 'ONLINE',
      serviceStatus: 'RUNNING',
      heartbeatAgo: 3,
      dataAgo: 5,
      cpu: 22,
      memory: 46,
      disk: 61,
      temp: 45,
      events: [{ id: 'e02-event-1', severity: 'INFO', type: 'HEARTBEAT_RECEIVED', message: 'Estação central online e transmitindo.', createdAt: minutesAgo(3) }],
      logs: [{ id: 'e02-log-1', level: 'INFO', source: 'agent', message: 'Heartbeat enviado para o SaaS.', occurredAt: minutesAgo(3) }],
    }),
    createStation({
      id: 'local-e03',
      name: 'UBS Solo Sagrado',
      slug: 'E03',
      location: 'Zona Norte - Solo Sagrado',
      latitude: -20.7795,
      longitude: -49.3855,
      ipAddress: '192.168.58.43',
      agentVersion: '1.0.9',
      computedStatus: 'OFFLINE',
      serviceStatus: 'UNKNOWN',
      heartbeatAgo: 190,
      dataAgo: 205,
      cpu: 6,
      memory: 34,
      disk: 70,
      temp: 36,
      events: [{ id: 'e03-event-1', severity: 'CRITICAL', type: 'STATION_OFFLINE', message: 'Estação sem heartbeat há mais de 3 horas.', createdAt: minutesAgo(190) }],
      logs: [{ id: 'e03-log-1', level: 'ERROR', source: 'network', message: 'Falha ao conectar com a API central antes de ficar offline.', occurredAt: minutesAgo(190) }],
    }),
    createStation({
      id: 'local-e04',
      name: 'UBS Eldorado',
      slug: 'E04',
      location: 'Jardim Eldorado',
      latitude: -20.8327,
      longitude: -49.3974,
      ipAddress: '192.168.58.44',
      agentVersion: '1.1.0',
      computedStatus: 'ONLINE',
      serviceStatus: 'FAILED',
      heartbeatAgo: 4,
      dataAgo: 96,
      cpu: 31,
      memory: 63,
      disk: 82,
      temp: 52,
      events: [{ id: 'e04-event-1', severity: 'ERROR', type: 'SERVICE_FAILED', message: 'Serviço de coleta Python falhou no systemd.', createdAt: minutesAgo(96) }],
      logs: [{ id: 'e04-log-1', level: 'ERROR', source: 'systemd', message: 'Serviço de coleta encerrado com código diferente de zero.', occurredAt: minutesAgo(96) }],
    }),
    createStation({
      id: 'local-e05',
      name: 'UBS São Deocleciano',
      slug: 'E05',
      location: 'Zona Leste - São Deocleciano',
      latitude: -20.8069,
      longitude: -49.3386,
      ipAddress: '192.168.58.45',
      agentVersion: '1.1.0',
      computedStatus: 'ONLINE',
      serviceStatus: 'RUNNING',
      heartbeatAgo: 2,
      dataAgo: 8,
      cpu: 74,
      memory: 72,
      disk: 91,
      temp: 69,
      events: [
        { id: 'e05-event-1', severity: 'WARNING', type: 'HIGH_TEMPERATURE', message: 'Temperatura da Raspberry acima do limite recomendado.', createdAt: minutesAgo(12) },
        { id: 'e05-event-2', severity: 'WARNING', type: 'DISK_USAGE_HIGH', message: 'Uso de disco acima de 90%.', createdAt: minutesAgo(18) },
      ],
      logs: [{ id: 'e05-log-1', level: 'WARNING', source: 'agent', message: 'Temperatura elevada detectada durante heartbeat.', occurredAt: minutesAgo(12) }],
    }),
    createStation({
      id: 'local-e06',
      name: 'UBS Vila Toninho',
      slug: 'E06',
      location: 'Zona Sul - Vila Toninho',
      latitude: -20.8594,
      longitude: -49.3568,
      ipAddress: '192.168.58.46',
      agentVersion: '1.1.0',
      computedStatus: 'ONLINE',
      serviceStatus: 'RUNNING',
      heartbeatAgo: 5,
      dataAgo: 7,
      cpu: 18,
      memory: 44,
      disk: 49,
      temp: 43,
      events: [],
      logs: [{ id: 'e06-log-1', level: 'INFO', source: 'collector', message: 'Estação operando em rotina normal.', occurredAt: minutesAgo(7) }],
    }),
    createStation({
      id: 'local-e07',
      name: 'UBS Jaguaré',
      slug: 'E07',
      location: 'Região Oeste - Jaguaré',
      latitude: -20.8001,
      longitude: -49.4218,
      ipAddress: '192.168.58.47',
      agentVersion: '1.1.0',
      computedStatus: 'ONLINE',
      serviceStatus: 'RUNNING',
      heartbeatAgo: 1,
      dataAgo: 4,
      cpu: 25,
      memory: 51,
      disk: 54,
      temp: 46,
      events: [],
      logs: [{ id: 'e07-log-1', level: 'INFO', source: 'agent', message: 'Conexão estável com a API central.', occurredAt: minutesAgo(4) }],
    }),
    createStation({
      id: 'local-e08',
      name: 'UBS Santo Antônio',
      slug: 'E08',
      location: 'Região Norte - Santo Antônio',
      latitude: -20.7684,
      longitude: -49.3586,
      ipAddress: '192.168.58.48',
      agentVersion: '1.0.8',
      computedStatus: 'OFFLINE',
      serviceStatus: 'STOPPED',
      heartbeatAgo: 260,
      dataAgo: 275,
      cpu: 4,
      memory: 28,
      disk: 66,
      temp: 33,
      events: [{ id: 'e08-event-1', severity: 'CRITICAL', type: 'STATION_OFFLINE', message: 'Estação sem comunicação há mais de 4 horas.', createdAt: minutesAgo(260) }],
      logs: [{ id: 'e08-log-1', level: 'ERROR', source: 'agent', message: 'Sem rota para a rede central.', occurredAt: minutesAgo(260) }],
    }),
    createStation({
      id: 'local-e09',
      name: 'UBS Estoril',
      slug: 'E09',
      location: 'Zona Sul - Estoril',
      latitude: -20.8383,
      longitude: -49.3789,
      ipAddress: '192.168.58.49',
      agentVersion: '1.1.0',
      computedStatus: 'ONLINE',
      serviceStatus: 'RUNNING',
      heartbeatAgo: 2,
      dataAgo: 3,
      cpu: 16,
      memory: 41,
      disk: 47,
      temp: 44,
      events: [],
      logs: [{ id: 'e09-log-1', level: 'INFO', source: 'collector', message: 'Pacote climático recebido sem atraso.', occurredAt: minutesAgo(3) }],
    }),
    createStation({
      id: 'local-e10',
      name: 'UBS Engenheiro Schmitt',
      slug: 'E10',
      location: 'Distrito de Engenheiro Schmitt',
      latitude: -20.7769,
      longitude: -49.2811,
      ipAddress: '192.168.58.50',
      agentVersion: '1.1.0',
      computedStatus: 'ONLINE',
      serviceStatus: 'RUNNING',
      heartbeatAgo: 6,
      dataAgo: 72,
      cpu: 29,
      memory: 56,
      disk: 77,
      temp: 50,
      events: [{ id: 'e10-event-1', severity: 'WARNING', type: 'NO_DATA_TRANSMISSION', message: 'Sem transmissão de dados climáticos há mais de 70 minutos.', createdAt: minutesAgo(72) }],
      logs: [{ id: 'e10-log-1', level: 'WARNING', source: 'collector', message: 'Arquivo CSV local atualizado, mas sem envio climático recente.', occurredAt: minutesAgo(72) }],
    }),
  ];

  return { stations };
}

function getLocalData(): LocalData {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) {
    try {
      return JSON.parse(existing) as LocalData;
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  const data = createPresentationData();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

function localDashboard(): DashboardResponse {
  const { stations } = getLocalData();
  const serviceProblems = stations.filter((station) => station.serviceStatus !== 'RUNNING').length;

  return {
    summary: {
      totalStations: stations.length,
      onlineCount: stations.filter((station) => station.computedStatus === 'ONLINE').length,
      offlineCount: stations.filter((station) => station.computedStatus === 'OFFLINE').length,
      serviceProblems,
    },
    stations,
  };
}

function localStation(id: string): StationDetail {
  const { stations } = getLocalData();
  const station = stations.find((item) => item.id === id || item.slug === id);

  if (!station) {
    throw new Error('Estação não encontrada no modo local.');
  }

  return station;
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);

  if (!response.ok) {
    throw new Error(`Erro na API: ${response.status}`);
  }

  return response.json();
}

export const api = {
  dashboard: async () => {
    if (LOCAL_PRESENTATION_MODE) return localDashboard();
    return request<DashboardResponse>('/dashboard');
  },
  station: async (id: string) => {
    if (LOCAL_PRESENTATION_MODE) return localStation(id);
    return request<StationDetail>(`/stations/${id}`);
  },
  resetLocalPresentation: () => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  },
};
