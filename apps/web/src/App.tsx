import { useEffect, useMemo, useState } from 'react';
import { Activity, Moon, Search, Sun } from 'lucide-react';
import { MetricsChart } from './components/MetricsChart';
import { OperationMap } from './components/OperationMap';
import { StatCard } from './components/StatCard';
import { StationTable } from './components/StationTable';
import { EnvironmentalDashboard } from './components/EnvironmentalDashboard';
import { api, DashboardResponse, StationDetail } from './services/api';
import { formatDate, formatDuration, formatPercent, formatTemperature } from './utils/format';

export function App() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [selectedStation, setSelectedStation] = useState<StationDetail | null>(null);
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [error, setError] = useState<string | null>(null);
  const [latitudeInput, setLatitudeInput] = useState('');
  const [longitudeInput, setLongitudeInput] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  async function loadDashboard() {
    try {
      setError(null);
      const data = await api.dashboard();
      setDashboard(data);

      if (selectedStation) {
        const detail = await api.station(selectedStation.id);
        setSelectedStation(detail);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  }

  async function selectStation(id: string) {
    const detail = await api.station(id);
    setSelectedStation(detail);
    setLatitudeInput(detail.latitude?.toString() ?? '');
    setLongitudeInput(detail.longitude?.toString() ?? '');
    setLocationMessage(null);
  }

  async function saveLocation() {
    if (!selectedStation) return;
    const latText = latitudeInput.trim().replace(',', '.');
    const lonText = longitudeInput.trim().replace(',', '.');
    const clearing = latText === '' && lonText === '';
    const latitude = clearing ? null : Number(latText);
    const longitude = clearing ? null : Number(lonText);
    if ((!clearing && (!latText || !lonText || !Number.isFinite(latitude) || !Number.isFinite(longitude))) ||
        (latitude !== null && (latitude < -90 || latitude > 90)) ||
        (longitude !== null && (longitude < -180 || longitude > 180))) {
      setLocationMessage('Informe latitude (-90 a 90) e longitude (-180 a 180), ou deixe ambas vazias.');
      return;
    }
    setLocationSaving(true);
    try {
      const updated = await api.updateCoordinates(selectedStation.id, latitude, longitude, adminKey);
      setSelectedStation((current) => current && current.id === updated.id
        ? { ...current, latitude: updated.latitude, longitude: updated.longitude }
        : current);
      setLocationMessage('Coordenadas atualizadas. O mapa usará a posição cadastrada.');
      await loadDashboard();
    } catch (err) {
      setLocationMessage(err instanceof Error ? err.message : 'Erro ao salvar coordenadas.');
    } finally {
      setLocationSaving(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    const interval = window.setInterval(loadDashboard, 10000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  const filteredStations = useMemo(() => {
    const stations = dashboard?.stations ?? [];
    return stations.filter((station) => {
      const target = `${station.name} ${station.slug} ${station.location ?? ''}`.toLowerCase();
      return target.includes(query.toLowerCase());
    });
  }, [dashboard, query]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">IoT Observability</span>
          <h1>DengueSaaS Monitor</h1>
          <p>Monitoramento centralizado das estações climáticas Raspberry Pi.</p>
        </div>
        <button className="theme-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {theme === 'dark' ? 'Claro' : 'Escuro'}
        </button>
      </header>

      {error && <div className="error-box">{error}. Confira se a API está rodando.</div>}

      <section className="stats-grid">
        <StatCard label="Estações" value={dashboard?.summary.totalStations ?? 0} hint="Total cadastradas" />
        <StatCard label="Online" value={dashboard?.summary.onlineCount ?? 0} hint="Com heartbeat recente" />
        <StatCard label="Offline" value={dashboard?.summary.offlineCount ?? 0} hint="Sem heartbeat" />
        <StatCard label="Serviços com alerta" value={dashboard?.summary.serviceProblems ?? 0} hint="systemd diferente de RUNNING" />
      </section>

      <OperationMap stations={filteredStations} onSelect={selectStation} />

      <section className="toolbar card">
        <Activity size={20} />
        <div className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar estação, slug ou localização" />
        </div>
      </section>

      <StationTable stations={filteredStations} onSelect={selectStation} />

      {selectedStation && (
        <section className="details-grid">
          <div className="card details-card">
            <div className="section-title">
              <span>Detalhes</span>
              <button onClick={() => setSelectedStation(null)}>Fechar</button>
            </div>
            <h2>{selectedStation.name}</h2>
            <dl>
              <div><dt>Localização</dt><dd>{selectedStation.location ?? '-'}</dd></div>
              <div><dt>Coordenadas</dt><dd>{selectedStation.latitude?.toFixed(4) ?? '-'}, {selectedStation.longitude?.toFixed(4) ?? '-'}</dd></div>
              <div><dt>Editar posição fixa</dt><dd>
                <form onSubmit={(event) => { event.preventDefault(); void saveLocation(); }} style={{ display: 'grid', gap: 8 }}>
                  <input aria-label="Latitude" placeholder="Latitude (ex.: -20.8339)" value={latitudeInput} onChange={(event) => setLatitudeInput(event.target.value)} />
                  <input aria-label="Longitude" placeholder="Longitude (ex.: -49.3999)" value={longitudeInput} onChange={(event) => setLongitudeInput(event.target.value)} />
                  <input aria-label="Chave administrativa" type="password" autoComplete="off" placeholder="Chave administrativa" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} />
                  <button type="submit" disabled={locationSaving || !adminKey}>{locationSaving ? 'Salvando...' : 'Salvar coordenadas'}</button>
                  {locationMessage && <small role="status">{locationMessage}</small>}
                </form>
              </dd></div>
              <div><dt>IP</dt><dd>{selectedStation.ipAddress ?? '-'}</dd></div>
              <div><dt>Agente</dt><dd>{selectedStation.agentVersion ?? '-'}</dd></div>
              <div><dt>Último heartbeat</dt><dd>{formatDate(selectedStation.lastHeartbeatAt)}</dd></div>
              <div><dt>Tempo online</dt><dd>{formatDuration(selectedStation.uptimeSeconds)}</dd></div>
              <div><dt>Serviço</dt><dd>{selectedStation.serviceStatus}</dd></div>
              <div><dt>CPU</dt><dd>{formatPercent(selectedStation.lastCpuPercent)}</dd></div>
              <div><dt>RAM</dt><dd>{formatPercent(selectedStation.lastMemoryPercent)}</dd></div>
              <div><dt>Disco</dt><dd>{formatPercent(selectedStation.lastDiskPercent)}</dd></div>
              <div><dt>Temperatura</dt><dd>{formatTemperature(selectedStation.lastTemperatureCelsius)}</dd></div>
            </dl>
          </div>

          <MetricsChart metrics={selectedStation.metrics} />

          <EnvironmentalDashboard
            readings={selectedStation.sensorReadings}
            latest={selectedStation.latestSensorPayload}
            latestAt={selectedStation.latestSensorPayloadAt}
          />

          <div className="card logs-card">
            <h2>Eventos recentes</h2>
            {selectedStation.events.length === 0 && <p>Nenhum evento registrado.</p>}
            {selectedStation.events.map((event) => (
              <div className="log-line" key={event.id}>
                <span>{formatDate(event.createdAt)}</span>
                <strong>{event.severity}</strong>
                <p>{event.message}</p>
              </div>
            ))}
          </div>

          <div className="card logs-card">
            <h2>Logs recentes</h2>
            {selectedStation.logs.length === 0 && <p>Nenhum log recebido.</p>}
            {selectedStation.logs.map((log) => (
              <div className="log-line" key={log.id}>
                <span>{formatDate(log.occurredAt)}</span>
                <strong>{log.level}</strong>
                <p>{log.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
