const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export type SensorPayload = {
  temperatura?: number | null;
  umidade?: number | null;
  pressao_abs?: number | null;
  pressao_rel?: number | null;
  qual_ar?: number | null;
  pluviometrico?: number | boolean | null;
  chuva_tensao?: number | null;
  vel_vento?: number | null;
  dir_vento?: number | null;
  anemometro_pulsos?: number | null;
  anemometro_rpm?: number | null;
  anemometro_intervalo_s?: number | null;
  [key: string]: unknown;
};

export type SensorReading = {
  id: string;
  collectedAt: string;
  payload: SensorPayload;
};

export type AdminUser = {
  id: string;
  username: string;
  role: string;
  mustChangePassword: boolean;
};

export type Station = {
  id: string;
  name: string;
  slug: string;
  location?: string | null;
  description?: string | null;
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
  lastBootId?: string | null;
  latestSensorPayload?: SensorPayload | null;
  latestSensorPayloadAt?: string | null;
};

export type DashboardResponse = {
  summary: { totalStations: number; onlineCount: number; offlineCount: number; serviceProblems: number };
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

export type StationCommand = {
  id: string;
  type: string;
  status: 'PENDING' | 'SENT' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  requestedAt: string;
  finishedAt?: string | null;
  result?: string | null;
  requestedBy?: string | null;
};

export type StationDetail = Station & {
  metrics: Metric[];
  sensorReadings: SensorReading[];
  commands: StationCommand[];
  events: Array<{ id: string; severity: string; type: string; message: string; createdAt: string }>;
  logs: Array<{ id: string; level: string; message: string; source?: string | null; occurredAt: string }>;
};

export type ActivityEvent = {
  id: string;
  type: string;
  message: string;
  severity: string;
  createdAt: string;
  station?: { name: string; slug: string } | null;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string };
    throw new ApiError(response.status, data.message ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function post<T>(path: string, body?: object) {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
}

export const api = {
  me: () => request<{ user: AdminUser }>('/auth/me'),
  login: (username: string, password: string) => post<{ user: AdminUser }>('/auth/login', { username, password }),
  logout: () => post<{ ok: boolean }>('/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ ok: boolean }>('/auth/change-password', { currentPassword, newPassword }),

  dashboard: () => request<DashboardResponse>('/dashboard'),
  station: (id: string) => request<StationDetail>(`/stations/${encodeURIComponent(id)}`),
  activity: () => request<ActivityEvent[]>('/admin/activity?limit=40'),
  saveStation: (id: string, data: {
    name?: string;
    location?: string | null;
    description?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }) => request<Station>(`/stations/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),
  restart: (id: string, action: 'RESTART_COLLECTOR' | 'REBOOT_HOST') =>
    post<{ id: string; status: string }>(`/stations/${encodeURIComponent(id)}/restart`, { action }),
  async downloadCsv(id?: string) {
    const path = id
      ? `/export/stations/${encodeURIComponent(id)}.csv`
      : '/export/stations.csv';
    const response = await fetch(`${API_URL}${path}`, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new ApiError(response.status, `Falha ao exportar CSV (HTTP ${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dengue-${id ?? 'todas-estacoes'}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
