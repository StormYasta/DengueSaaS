const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333/api';

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

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);

  if (!response.ok) {
    throw new Error(`Erro na API: ${response.status}`);
  }

  return response.json();
}

export const api = {
  dashboard: () => request<DashboardResponse>('/dashboard'),
  station: (id: string) => request<StationDetail>(`/stations/${id}`),
};
