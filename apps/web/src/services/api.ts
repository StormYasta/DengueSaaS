import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export type RegionCollection = FeatureCollection<Polygon | MultiPolygon, { name: string }>;

export type RegionMapResponse = {
  available: boolean;
  source: string | null;
  updatedAt: string | null;
  geojson: RegionCollection | null;
  names: string[];
};

export type RangePreset = '1h' | '6h' | '12h' | '24h' | '7d' | '30d' | 'custom';

export type PeriodSelection = {
  range: RangePreset;
  from?: string;
  to?: string;
};

export type EnvironmentalValues = {
  temperatura: number | null;
  umidade: number | null;
  vel_vento: number | null;
  qual_ar: number | null;
};

export type EnvironmentalPoint = EnvironmentalValues & { at: string };

export type SystemPoint = {
  at: string;
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  temperatureCelsius: number | null;
};

export type AnalyticsResponse = {
  period: { range: RangePreset; from: string; to: string };
  scope: 'city' | 'station';
  timeBasis: 'sampledAtWithReceiveFallback';
  bucketMinutes: number;
  totalStations: number;
  onlineStations: number;
  freshStations: number;
  snapshotAt: string | null;
  averages: EnvironmentalValues;
  samplesByMetric: Record<keyof EnvironmentalValues, number>;
  series: EnvironmentalPoint[];
  systemSeries: SystemPoint[];
};

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

export type UserRole = 'ADMIN' | 'OPERADOR' | 'VISUALIZADOR';

export type AdminUser = {
  id: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
};

export type ManagedUser = AdminUser & {
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserWithTemporaryPassword = {
  user: ManagedUser;
  temporaryPassword: string;
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
  users: () => request<ManagedUser[]>('/admin/users'),
  createUser: (username: string, role: UserRole) =>
    post<UserWithTemporaryPassword>('/admin/users', { username, role }),
  updateUser: (id: string, data: { role?: UserRole; active?: boolean }) =>
    request<{ user: ManagedUser }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  resetUserPassword: (id: string) =>
    post<UserWithTemporaryPassword>(`/admin/users/${encodeURIComponent(id)}/reset-password`),


  dashboard: () => request<DashboardResponse>('/dashboard'),
  regions: () => request<RegionMapResponse>('/regions'),
  importRegions: (geojson: unknown, source: string) =>
    post<{ ok: boolean; regionCount: number; polygonCount: number; updatedAt: string }>(
      '/regions/import', { geojson, source },
    ),
  analytics: (period: PeriodSelection, stationId?: string) => {
    const params = new URLSearchParams({ range: period.range });
    if (period.range === 'custom' && period.from && period.to) {
      params.set('from', period.from);
      params.set('to', period.to);
    }
    if (stationId) params.set('stationId', stationId);
    return request<AnalyticsResponse>(`/analytics?${params.toString()}`);
  },
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
