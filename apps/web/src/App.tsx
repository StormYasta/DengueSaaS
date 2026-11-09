import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, Bell, ChartNoAxesCombined, CheckCircle2,
  ChevronRight, CircleHelp, CloudSun, Cpu, Database, Download, Droplets,
  LayoutDashboard, LockKeyhole, LogOut, MapPin, Menu, Moon, Power,
  RadioTower, RefreshCw, RotateCcw, Search, Server, Settings2, ShieldCheck, Users,
  Sun, Thermometer, Wind, X,
} from 'lucide-react';
import { EnvironmentalDashboard } from './components/EnvironmentalDashboard';
import { MeasurementCharts, formattedMeasure } from './components/MeasurementCharts';
import { PeriodControls } from './components/PeriodControls';
import { MetricsChart } from './components/MetricsChart';
import { OperationMap } from './components/OperationMap';
import { StationTable } from './components/StationTable';
import { UserManagement } from './components/UserManagement';
import {
  api, ActivityEvent, AdminUser, ApiError, AnalyticsResponse, DashboardResponse, PeriodSelection, RegionMapResponse, Station, StationDetail,
} from './services/api';
import { formatDate, formatDuration, formatPercent, formatTemperature } from './utils/format';
import { belongsToRegion } from './utils/regions';

type Page = 'overview' | 'stations' | 'telemetry' | 'activity' | 'users' | 'settings';

const nav = [
  { key: 'overview' as Page, label: 'Visão geral', Icon: LayoutDashboard },
  { key: 'stations' as Page, label: 'Estações', Icon: RadioTower },
  { key: 'telemetry' as Page, label: 'Telemetria', Icon: ChartNoAxesCombined },
  { key: 'activity' as Page, label: 'Atividades', Icon: Activity },
  { key: 'users' as Page, label: 'Usuários', Icon: Users },
  { key: 'settings' as Page, label: 'Configurações', Icon: Settings2 },
];

const pageTitles: Record<Page, { title: string; desc: string }> = {
  overview: { title: 'Central de monitoramento', desc: 'Visão operacional das estações meteorológicas conectadas' },
  stations: { title: 'Gerenciar estações', desc: 'Status, ações remotas e exportações individuais' },
  telemetry: { title: 'Telemetria ambiental', desc: 'Medições e comportamento dos sensores em detalhe' },
  activity: { title: 'Histórico de atividades', desc: 'Auditoria de alterações e comandos administrativos' },
  users: { title: 'Gestão de usuários', desc: 'Cadastre usuários, defina permissões e controle o acesso à plataforma' },
  settings: { title: 'Configurações', desc: 'Segurança, conta administrativa e informações da plataforma' },
};

function statusText(station: Station) {
  if (station.computedStatus !== 'ONLINE') return 'Offline';
  if (station.serviceStatus !== 'RUNNING') return 'Atenção';
  return 'Online';
}

function statusClass(station: Station) {
  if (station.computedStatus !== 'ONLINE') return 'danger';
  if (station.serviceStatus !== 'RUNNING') return 'warning';
  return 'success';
}

export function App() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [overviewPeriod, setOverviewPeriod] = useState<PeriodSelection>({ range: '24h' });
  const [detailPeriod, setDetailPeriod] = useState<PeriodSelection>({ range: '24h' });
  const [overviewStationId, setOverviewStationId] = useState('');
  const [regionMap, setRegionMap] = useState<RegionMapResponse | null>(null);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [regionFile, setRegionFile] = useState<File | null>(null);
  const [regionSource, setRegionSource] = useState('https://sig.riopreto.sp.gov.br/portal/home/');
  const [regionImportBusy, setRegionImportBusy] = useState(false);
  const [overviewAnalytics, setOverviewAnalytics] = useState<AnalyticsResponse | null>(null);
  const [detailAnalytics, setDetailAnalytics] = useState<AnalyticsResponse | null>(null);
  const [analyticsError, setAnalyticsError] = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [overviewRefresh, setOverviewRefresh] = useState(0);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [selectedStation, setSelectedStation] = useState<StationDetail | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [page, setPage] = useState<Page>('overview');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = window.localStorage.getItem('dengue-saas-theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      // Em modo privado/restrito, o painel continua utilizável sem armazenamento.
      return 'dark';
    }
  });
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  useEffect(() => {
    document.body.dataset.theme = theme;
    try {
      window.localStorage.setItem('dengue-saas-theme', theme);
    } catch {
      // O tema segue funcionando nesta sessão mesmo sem localStorage.
    }
  }, [theme]);

  useEffect(() => {
    api.me().then(({ user: logged }) => setUser(logged))
      .catch(() => setUser(null))
      .finally(() => setAuthChecking(false));
  }, []);

  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    let mounted = true;
    api.regions().then((data) => { if (mounted) setRegionMap(data); })
      .catch((err) => { if (mounted) setError(err instanceof Error ? err.message : 'Não foi possível carregar as regiões'); });
    return () => { mounted = false; };
  }, [user?.id, user?.mustChangePassword]);

  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    let mounted = true;
    const refresh = async () => {
      try {
        const [data, recent] = await Promise.all([api.dashboard(), user.role === 'ADMIN' ? api.activity() : Promise.resolve([])]);
        if (mounted) {
          setDashboard(data);
          setActivity(recent);
          setError('');
        }
      } catch (err) {
        if (!mounted) return;
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
        } else {
          setError(err instanceof Error ? err.message : 'Falha ao atualizar dashboard');
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [user?.id, user?.mustChangePassword]);

  useEffect(() => {
    if (!user || user.mustChangePassword || page !== 'overview') return;
    let mounted = true;
    setOverviewAnalytics(null);
    setAnalyticsLoading(true);
    setAnalyticsError('');
    async function refresh() {
      try {
        const result = await api.analytics(overviewPeriod, overviewStationId || undefined);
        if (mounted) { setOverviewAnalytics(result); setAnalyticsError(''); }
      } catch (err) {
        if (mounted) setAnalyticsError(err instanceof Error ? err.message : 'Falha nas médias da rede');
      } finally {
        if (mounted) setAnalyticsLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [user?.id, user?.mustChangePassword, page, overviewPeriod, overviewStationId, overviewRefresh]);

  useEffect(() => {
    if (!user || user.mustChangePassword || page !== 'telemetry' || !selectedStation) return;
    let mounted = true;
    setDetailAnalytics(null);
    setAnalyticsLoading(true);
    setAnalyticsError('');
    async function refresh() {
      try {
        const [result, updatedStation] = await Promise.all([
          api.analytics(detailPeriod, selectedStation!.id),
          api.station(selectedStation!.id),
        ]);
        if (mounted) {
          setDetailAnalytics(result);
          setSelectedStation((old) => old?.id === updatedStation.id ? updatedStation : old);
          setAnalyticsError('');
        }
      } catch (err) {
        if (mounted) setAnalyticsError(err instanceof Error ? err.message : 'Falha no histórico da estação');
      } finally {
        if (mounted) setAnalyticsLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [user?.id, user?.mustChangePassword, page, detailPeriod, selectedStation?.id, detailRefresh]);

  async function importRegionGeoJSON(event: React.FormEvent) {
    event.preventDefault();
    if (!regionFile) return;
    if (regionFile.size > 7_000_000) {
      setError('O arquivo é muito grande. Simplifique a malha para menos de 7 MB.');
      return;
    }
    setRegionImportBusy(true);
    setError('');
    try {
      const contents = JSON.parse(await regionFile.text()) as unknown;
      const result = await api.importRegions(contents, regionSource.trim());
      const updated = await api.regions();
      setRegionMap(updated);
      setSelectedRegion('');
      setRegionFile(null);
      setNotice(`Malha importada: ${result.regionCount} regiões, ${result.polygonCount} polígonos.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível importar o arquivo GeoJSON');
    } finally {
      setRegionImportBusy(false);
    }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setAuthBusy(true); setError('');
    try {
      const result = await api.login(username, password);
      setUser(result.user);
      setCurrentPassword(password);
      setPassword('');
      setNotice('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally { setAuthBusy(false); }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) { setError('As senhas novas não coincidem.'); return; }
    if (newPassword.length < 12) { setError('Use pelo menos 12 caracteres.'); return; }
    setAuthBusy(true); setError('');
    try {
      await api.changePassword(currentPassword, newPassword);
      const result = await api.me();
      setUser(result.user);
      setNewPassword(''); setConfirmPassword(''); setCurrentPassword('');
      setNotice('Senha atualizada com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar a senha');
    } finally { setAuthBusy(false); }
  }

  async function logout() {
    try { await api.logout(); } catch { /* sessão pode já ter expirado */ }
    setUser(null); setDashboard(null); setSelectedStation(null);
    setOverviewAnalytics(null); setDetailAnalytics(null);
    setRegionMap(null); setSelectedRegion('');
    setNotice(''); setError(''); setPage('overview');
  }

  function fillEditor(detail: StationDetail) {
    setEditName(detail.name);
    setEditLocation(detail.location ?? '');
    setEditDescription(detail.description ?? '');
    setLat(detail.latitude?.toString() ?? '');
    setLon(detail.longitude?.toString() ?? '');
  }

  async function openStation(id: string, nextPage: Page = 'telemetry') {
    setError('');
    try {
      const detail = await api.station(id);
      setDetailAnalytics(null);
      setSelectedStation(detail);
      fillEditor(detail);
      setPage(nextPage);
      setMobileNav(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao carregar estação'); }
  }

  async function saveStation(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedStation) return;
    const latText = lat.trim().replace(',', '.');
    const lonText = lon.trim().replace(',', '.');
    const latitude = latText === '' ? null : Number(latText);
    const longitude = lonText === '' ? null : Number(lonText);
    if ((latitude === null) !== (longitude === null) ||
      (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
      setError('Informe ambas as coordenadas válidas, ou deixe as duas vazias.');
      return;
    }
    setBusyAction('save');
    try {
      await api.saveStation(selectedStation.id, {
        name: editName, location: editLocation, description: editDescription,
        latitude, longitude,
      });
      await openStation(selectedStation.id, page);
      const data = await api.dashboard();
      setDashboard(data);
      setNotice('Cadastro da estação atualizado.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao salvar'); }
    finally { setBusyAction(null); }
  }

  async function exportCsv(id?: string) {
    setBusyAction(id ?? 'all'); setError('');
    try { await api.downloadCsv(id); setNotice('Exportação CSV iniciada.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erro na exportação'); }
    finally { setBusyAction(null); }
  }

  async function restartStation(station: Station, action: 'RESTART_COLLECTOR' | 'REBOOT_HOST') {
    const fullReboot = action === 'REBOOT_HOST';
    const message = fullReboot
      ? `Reiniciar completamente a Raspberry da estação ${station.slug}? As medições e a conexão MQTT serão interrompidas durante o reboot.`
      : `Reiniciar apenas o serviço coletor da estação ${station.slug}? A coleta será interrompida por alguns instantes.`;
    if (!window.confirm(message)) return;
    setBusyAction(station.id + action); setError('');
    try {
      await api.restart(station.id, action);
      setNotice(`Comando solicitado para ${station.slug}. Aguarde o agente confirmar a execução.`);
      if (selectedStation?.id === station.id) await openStation(station.id, page);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível solicitar o comando'); }
    finally { setBusyAction(null); }
  }

  const filtered = useMemo(() => (dashboard?.stations ?? []).filter((station) =>
    `${station.slug} ${station.name} ${station.location ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  ), [dashboard, query]);

  const canAdmin = user?.role === 'ADMIN';
  const canOperate = canAdmin || user?.role === 'OPERADOR';
  const connected = dashboard?.summary.onlineCount ?? 0;
  const total = dashboard?.summary.totalStations ?? 0;
  const overviewStations = overviewStationId
    ? (dashboard?.stations ?? []).filter((item) => item.id === overviewStationId)
    : (dashboard?.stations ?? []);
  const mappedStations = selectedRegion && regionMap?.geojson
    ? overviewStations.filter((item) => belongsToRegion(item, regionMap.geojson, selectedRegion))
    : overviewStations;
  const overviewCity = overviewStationId === '';


  if (authChecking) return <main className="auth-screen"><div className="auth-panel">Carregando plataforma...</div></main>;

  if (!user) return (
    <main className="auth-screen">
      <div className="auth-brand">
        <div className="brand-glyph"><CloudSun size={36} /></div>
        <span className="eyebrow">Gestão de estações IoT</span>
        <h1>Dengue<span>SaaS</span></h1>
        <p>Uma central para monitorar, administrar e acompanhar sua rede meteorológica em tempo real.</p>
        <div className="auth-highlights">
          <span><ShieldCheck size={17}/> Acesso protegido</span>
          <span><RadioTower size={17}/> Gestão centralizada</span>
          <span><ChartNoAxesCombined size={17}/> Telemetria ambiental</span>
        </div>
      </div>
      <form className="auth-panel" onSubmit={(event) => { void login(event); }}>
        <div className="auth-icon"><LockKeyhole size={22}/></div>
        <h2>Entrar na plataforma</h2>
        <p>Use sua conta administrativa para continuar.</p>
        {error && <div className="error-box" role="alert">{error}</div>}
        <label>Usuário<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>Senha<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="primary-button" type="submit" disabled={authBusy}>{authBusy ? 'Entrando...' : 'Entrar no painel'}<ArrowRight size={17}/></button>
        <small>O acesso requer uma conta cadastrada pelo administrador.</small>
      </form>
    </main>
  );

  if (user.mustChangePassword) return (
    <main className="auth-screen">
      <div className="auth-brand">
        <div className="brand-glyph"><ShieldCheck size={38}/></div>
        <span className="eyebrow">Primeiro acesso</span>
        <h1>Proteja sua <span>conta.</span></h1>
        <p>Antes de administrar suas estações, substitua a senha padrão por uma senha pessoal e forte.</p>
      </div>
      <form className="auth-panel" onSubmit={(event) => { void changePassword(event); }}>
        <h2>Alteração obrigatória de senha</h2>
        <p>Para continuar, substitua sua senha provisória por uma senha pessoal de pelo menos 12 caracteres.</p>
        {error && <div className="error-box" role="alert">{error}</div>}
        <label>Senha atual<input type="password" required value={currentPassword} autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)}/></label>
        <label>Nova senha (mínimo 12 caracteres)<input type="password" minLength={12} required value={newPassword} autoComplete="new-password" onChange={(event) => setNewPassword(event.target.value)}/></label>
        <label>Confirmar nova senha<input type="password" minLength={12} required value={confirmPassword} autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)}/></label>
        <button className="primary-button" type="submit" disabled={authBusy}>Salvar nova senha <ArrowRight size={17}/></button>
        <button className="text-button" type="button" onClick={() => { void logout(); }}>Sair</button>
      </form>
    </main>
  );

  return (
    <div className="admin-layout">
      <aside className={`admin-sidebar ${mobileNav ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo"><CloudSun size={25}/></div>
          <div><strong>DengueSaaS</strong><small>ADMIN CONSOLE</small></div>
          <button className="mobile-only icon-button" onClick={() => setMobileNav(false)} aria-label="Fechar menu"><X size={19}/></button>
        </div>
        <div className="sidebar-overline">WORKSPACE</div>
        <nav aria-label="Navegação principal">
          {nav.filter(({ key }) => (key !== 'users' && key !== 'activity') || canAdmin).map(({ key, label, Icon }) => (
            <button key={key} className={`sidebar-link ${page === key ? 'active' : ''}`}
              onClick={() => { setPage(key); setMobileNav(false); }}>
              <Icon size={19}/><span>{label}</span>{page === key && <ChevronRight size={15}/>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-status"><span className="pulse-dot"/><div><strong>Sistema conectado</strong><small>{connected} de {total} estações online</small></div></div>
          <button className="sidebar-profile" onClick={() => { setPage('settings'); setMobileNav(false); }}>
            <div className="profile-avatar">{user.username.slice(0, 2).toUpperCase()}</div>
              <span><strong>{user.username}</strong><small>{user.role === 'ADMIN' ? 'Administrador' : user.role === 'OPERADOR' ? 'Operador' : 'Visualizador'}</small></span><Settings2 size={17}/>
          </button>
          <button className="sidebar-link logout-link" onClick={() => { void logout(); }}><LogOut size={18}/> Encerrar sessão</button>
        </div>
      </aside>

      <div className={`admin-main ${page === 'overview' ? 'overview-page' : ''}`}>
        <header className="admin-header">
          <div className="header-heading">
            <button className="mobile-only icon-button" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={20}/></button>
            <div><div className="header-breadcrumb">Painel administrativo <ChevronRight size={13}/> {pageTitles[page].title}</div>
              <h1>{pageTitles[page].title}</h1>
              <p>{pageTitles[page].desc}</p>
            </div>
          </div>
          <div className="header-actions">
            <span className="header-live"><span className="pulse-dot"/> Atualização a cada 15s</span>
            <button className="icon-button" title="Alternar tema" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}
            </button>
            {canOperate && <button className="outline-button" onClick={() => { void exportCsv(); }} disabled={busyAction === 'all'}>
              <Download size={17}/> Exportar tudo
            </button>}
          </div>
        </header>

        <div className="admin-content">
          {error && <div className="error-box" role="alert"><AlertTriangle size={17}/>{error}<button onClick={() => setError('')} aria-label="Fechar alerta"><X size={16}/></button></div>}
          {notice && <div className="notice-box" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso"><X size={16}/></button></div>}


          {page === 'overview' && <>
            <div className="overview-intro">
              <div><span className="eyebrow">PANORAMA CLIMÁTICO</span>
                <h2>{overviewCity ? 'Resumo da cidade' : 'Resumo da estação'}</h2>
                <p>{overviewCity ? 'Médias das estações monitoradas em São José do Rio Preto' : 'Indicadores da estação selecionada'}</p>
              </div>
              <button type="button" className="overview-updated" onClick={() => setOverviewRefresh((n) => n + 1)} title="Atualizar médias e históricos">
                <RefreshCw size={16}/> Atualizar médias
              </button>
            </div>

            <PeriodControls value={overviewPeriod} onChange={setOverviewPeriod}
              stations={dashboard?.stations ?? []} stationId={overviewStationId} onStationChange={setOverviewStationId}/>

            {analyticsError && <div className="error-box" role="alert"><AlertTriangle size={16}/>{analyticsError}</div>}

            <div className="overview-analytics-layout">
              <section className="overview-summary-column" aria-label="Resumo climático atual">
                <div className="city-summary-head">
                  <div>
                    <span className="eyebrow">LEITURAS RECENTES</span>
                    <h2>{overviewCity ? 'Condição média da rede' : 'Condição atual da estação'}</h2>
                  </div>
                  <div className="city-sample-badge" title="Estações online com leitura recente">
                    <RadioTower size={16}/>
                    <span><strong>{overviewAnalytics?.freshStations ?? '—'} / {overviewAnalytics?.totalStations ?? overviewStations.length}</strong>
                      <small>com dados</small></span>
                  </div>
                </div>

                <div className="city-summary-grid">
                  {([
                    { key: 'temperatura', title: 'Temperatura média', unit: '°C', Icon: Thermometer, color: '#ffad61' },
                    { key: 'umidade', title: 'Umidade média', unit: '%', Icon: Droplets, color: '#5aaeff' },
                    { key: 'vel_vento', title: 'Vento médio', unit: 'km/h', Icon: Wind, color: '#27cf9d' },
                    { key: 'qual_ar', title: 'Indicador do ar', unit: 'índice', Icon: Activity, color: '#b58bff' },
                  ] as const).map((indicator) => (
                    <article className="card city-summary-card" key={indicator.key}>
                      <div className="city-card-heading">
                        <span>{indicator.title}</span>
                        <indicator.Icon size={16} style={{ color: indicator.color }}/>
                      </div>
                      <strong>{formattedMeasure(overviewAnalytics?.averages[indicator.key], indicator.unit)}</strong>
                      <small>{overviewAnalytics?.samplesByMetric[indicator.key] ?? 0} estação(ões)</small>
                    </article>
                  ))}
                </div>

                <div className="city-summary-footnote">
                  <span><RadioTower size={14}/> {connected} online de {total} cadastradas · {(dashboard?.stations ?? []).filter((item) => item.computedStatus !== 'ONLINE' || item.serviceStatus !== 'RUNNING').length} em atenção/offline</span>
                  <span>Última leitura: {formatDate(overviewAnalytics?.snapshotAt)}</span>
                </div>
                {overviewCity && <p className="city-disclaimer">
                  Média dos pontos monitorados, não de toda a cidade. Cada estação com leitura válida e recente tem peso igual.
                </p>}
              </section>

              <section className="overview-charts-column" aria-label="Evolução histórica do clima">
                {analyticsLoading && !overviewAnalytics && <div className="card measurement-empty">Carregando histórico do período...</div>}
                {overviewAnalytics && <MeasurementCharts
                  compact
                  points={overviewAnalytics.series}
                  heading={overviewCity ? 'Evolução das médias entre estações' : 'Histórico da estação selecionada'}
                  description={`Histórico no período selecionado · intervalos de ${overviewAnalytics.bucketMinutes} minuto(s)`}
                />}
              </section>
            </div>

            <OperationMap
              stations={mappedStations}
              onSelect={(id) => { void openStation(id); }}
              regions={regionMap}
              selectedRegion={selectedRegion}
              onRegionSelect={setSelectedRegion}
            />
            {selectedRegion && <div className="regional-filter-note">
              <span><MapPin size={16}/> Região {selectedRegion}: {mappedStations.length} estação(ões) mapeada(s).
                As médias acima continuam considerando o escopo escolhido no filtro principal.</span>
              <button type="button" onClick={() => setSelectedRegion('')}>Limpar região</button>
            </div>}
            <div className="section-heading"><div><h2>Estações monitoradas</h2><p>Situação operacional e última leitura por estação</p></div>
              <button className="text-button" onClick={() => setPage('stations')}>Gerenciar estações <ArrowRight size={16}/></button></div>
            <StationTable stations={mappedStations} onSelect={(id) => { void openStation(id); }}/>
          </>}

          {page === 'stations' && <>
            <div className="section-toolbar">
              <div className="search-box"><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, ID ou localização"/></div>
              <span className="count-pill">{filtered.length} estações</span>
            </div>
            <div className="station-card-grid">
              {filtered.map((station) => (
                <article key={station.id} className="station-manage-card">
                  <div className="station-card-top"><div className="station-icon"><RadioTower size={22}/></div><span className={`status-chip ${statusClass(station)}`}><span/>{statusText(station)}</span></div>
                  <div className="station-card-name"><small>{station.slug}</small><h3>{station.name}</h3><p><MapPin size={14}/>{station.location ?? 'Localização não cadastrada'}</p></div>
                  <div className="station-quick-stats">
                    <span><Thermometer size={16}/> {formatTemperature(station.latestSensorPayload?.temperatura)}</span>
                    <span><Droplets size={16}/> {formatPercent(station.latestSensorPayload?.umidade)}</span>
                    <span><Cpu size={16}/> {formatPercent(station.lastCpuPercent)}</span>
                    <span><Server size={16}/> {formatPercent(station.lastDiskPercent)}</span>
                  </div>
                  <p className="station-last">Último contato: {formatDuration(station.secondsSinceHeartbeat)}</p>
                  <div className="station-card-actions">
                    <button className="primary-button small" onClick={() => { void openStation(station.id); }}>Detalhes <ArrowRight size={15}/></button>
                    {canOperate && <button className="icon-button" title="Baixar CSV da estação" onClick={() => { void exportCsv(station.id); }}><Download size={17}/></button>}
                    {canOperate && <button className="icon-button" title="Reiniciar coletor de sensores" disabled={station.computedStatus !== 'ONLINE'} onClick={() => { void restartStation(station, 'RESTART_COLLECTOR'); }}><RotateCcw size={17}/></button>}
                    {canAdmin && <button className="icon-button danger-button" title="Reiniciar Raspberry Pi" disabled={station.computedStatus !== 'ONLINE' || !station.lastBootId} onClick={() => { void restartStation(station, 'REBOOT_HOST'); }}><Power size={17}/></button>}
                  </div>
                </article>
              ))}
            </div>
            {!filtered.length && <div className="card empty-state"><CircleHelp size={27}/><h3>Nenhuma estação encontrada</h3><p>Ajuste sua busca ou aguarde o primeiro heartbeat de um dispositivo.</p></div>}
          </>}

          {page === 'telemetry' && <>
            <div className="section-toolbar telemetry-select">
              <label>Estação em análise
                <select value={selectedStation?.id ?? ''} onChange={(e) => { void openStation(e.target.value); }}>
                  <option value="" disabled>Selecione uma estação</option>
                  {(dashboard?.stations ?? []).map((station) => <option value={station.id} key={station.id}>{station.slug} — {station.name}</option>)}
                </select>
              </label>
              {selectedStation && <div className="header-actions">
                {canOperate && <button className="outline-button" onClick={() => { void exportCsv(selectedStation.id); }}><Download size={16}/> CSV da estação</button>}
                <button className="outline-button" onClick={() => { setDetailRefresh((n) => n + 1); }}><RefreshCw size={16}/> Atualizar</button>
              </div>}
            </div>
            {selectedStation && <PeriodControls value={detailPeriod} onChange={setDetailPeriod}/>}
            {analyticsError && <div className="error-box" role="alert"><AlertTriangle size={16}/>{analyticsError}</div>}
            {!selectedStation ? <div className="card empty-state"><ChartNoAxesCombined size={32}/><h3>Selecione uma estação</h3><p>Escolha um ponto de coleta para visualizar sensores e diagnósticos.</p></div> : <>
              <div className="station-detail-banner">
                <div><span className="eyebrow">ESTAÇÃO {selectedStation.slug}</span><h2>{selectedStation.name}</h2>
                  <p><MapPin size={16}/>{selectedStation.location ?? 'Sem localização'} · {selectedStation.ipAddress ?? 'IP não informado'}</p></div>
                <span className={`status-chip ${statusClass(selectedStation)}`}><span/>{statusText(selectedStation)}</span>
              </div>
              <div className="details-grid">
                <div className="card details-card">
                  <div className="section-title"><span>Diagnóstico operacional</span></div>
                  <dl>
                    <div><dt>Último contato</dt><dd>{formatDate(selectedStation.lastHeartbeatAt)}</dd></div>
                    <div><dt>Última coleta</dt><dd>{formatDate(selectedStation.lastDataReceivedAt)}</dd></div>
                    <div><dt>CPU</dt><dd>{formatPercent(selectedStation.lastCpuPercent)}</dd></div>
                    <div><dt>RAM</dt><dd>{formatPercent(selectedStation.lastMemoryPercent)}</dd></div>
                    <div><dt>Disco</dt><dd>{formatPercent(selectedStation.lastDiskPercent)}</dd></div>
                    <div><dt>Temperatura da Pi</dt><dd>{formatTemperature(selectedStation.lastTemperatureCelsius)}</dd></div>
                    <div><dt>Serviço</dt><dd>{selectedStation.serviceStatus}</dd></div>
                    <div><dt>Versão do agente</dt><dd>{selectedStation.agentVersion ?? '—'}</dd></div>
                  </dl>
                </div>
                {analyticsLoading && !detailAnalytics && <div className="card measurement-empty">Carregando telemetria do período...</div>}
                {detailAnalytics && <>
                  <MetricsChart metrics={detailAnalytics.systemSeries}/>
                  <EnvironmentalDashboard
                    readings={detailAnalytics.series.map((point) => ({
                      id: point.at,
                      collectedAt: point.at,
                      payload: {
                        temperatura: point.temperatura, umidade: point.umidade,
                        vel_vento: point.vel_vento, qual_ar: point.qual_ar,
                      },
                    }))}
                    latest={selectedStation.latestSensorPayload}
                    latestAt={selectedStation.latestSensorPayloadAt}
                  />
                </>}
                {canAdmin && <div className="card details-card">
                  <h2>Editar estação</h2>
                  <form className="station-edit-form" onSubmit={(e) => { void saveStation(e); }}>
                    <label>Nome<input required minLength={2} value={editName} onChange={(e) => setEditName(e.target.value)}/></label>
                    <label>Localização<input value={editLocation} onChange={(e) => setEditLocation(e.target.value)}/></label>
                    <label>Descrição<textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)}/></label>
                    <div className="form-row"><label>Latitude<input placeholder="-20.8339" value={lat} onChange={(e) => setLat(e.target.value)}/></label><label>Longitude<input placeholder="-49.3999" value={lon} onChange={(e) => setLon(e.target.value)}/></label></div>
                    <button className="primary-button" disabled={busyAction === 'save'} type="submit">Salvar alterações <CheckCircle2 size={16}/></button>
                  </form>
                </div>}
                <div className="card details-card">
                  <h2>Comandos remotos</h2><p className="muted">O agente executa apenas ações predefinidas. Cada comando fica registrado para auditoria.</p>
                  {canOperate && <div className="command-buttons">
                    <button className="outline-button" disabled={selectedStation.computedStatus !== 'ONLINE'} onClick={() => { void restartStation(selectedStation, 'RESTART_COLLECTOR'); }}><RotateCcw size={17}/> Reiniciar coletor</button>
                    {canAdmin && <button className="outline-button danger-button" disabled={selectedStation.computedStatus !== 'ONLINE' || !selectedStation.lastBootId} onClick={() => { void restartStation(selectedStation, 'REBOOT_HOST'); }}><Power size={17}/> Reiniciar Raspberry</button>}
                  </div>}
                  <h3>Últimos comandos</h3>
                  <div className="command-list">
                    {selectedStation.commands?.length ? selectedStation.commands.map((cmd) => <div className="command-item" key={cmd.id}><span>{cmd.type === 'REBOOT_HOST' ? 'Reboot da Pi' : 'Reinício do coletor'}<small>{formatDate(cmd.requestedAt)}</small></span><b>{cmd.status}</b></div>) : <p className="muted">Nenhum comando enviado.</p>}
                  </div>
                </div>
                <div className="card logs-card"><h2>Eventos recentes</h2>{selectedStation.events.length ? selectedStation.events.map((ev) => <div className="log-line" key={ev.id}><span>{formatDate(ev.createdAt)}</span><strong>{ev.severity}</strong><p>{ev.message}</p></div>) : <p className="muted">Sem eventos recentes.</p>}</div>
                <div className="card logs-card"><h2>Logs da estação</h2>{selectedStation.logs.length ? selectedStation.logs.map((log) => <div className="log-line" key={log.id}><span>{formatDate(log.occurredAt)}</span><strong>{log.level}</strong><p>{log.message}</p></div>) : <p className="muted">Sem logs recentes.</p>}</div>
              </div>
            </>}
          </>}

          {page === 'users' && canAdmin && <UserManagement currentUser={user}/>}
          {page === 'activity' && canAdmin && <div className="card activity-card"><div className="section-heading"><div><h2>Trilha de auditoria</h2><p>Ações realizadas por administradores e agentes</p></div><ShieldCheck size={21}/></div>
            {activity.length ? activity.map((event) => <div className="activity-entry" key={event.id}><div className="activity-mark"><Activity size={16}/></div><div><strong>{event.message}</strong><p>{event.station ? `${event.station.slug} · ${event.station.name}` : 'Plataforma'} · {event.type}</p></div><time>{formatDate(event.createdAt)}</time></div>) : <div className="empty-state"><Bell size={24}/><p>Nenhuma atividade administrativa registrada ainda.</p></div>}
          </div>}

          {page === 'settings' && <div className="settings-grid">
            <div className="card settings-card"><div className="settings-icon"><ShieldCheck size={23}/></div><h2>Segurança da conta</h2><p>Atualize sua senha de acesso periodicamente.</p>
              <form className="station-edit-form" onSubmit={(e) => { void changePassword(e); }}>
                <label>Senha atual<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}/></label>
                <label>Nova senha<input required type="password" minLength={12} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}/></label>
                <label>Confirmar nova senha<input required type="password" minLength={12} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}/></label>
                <button className="primary-button" type="submit" disabled={authBusy}>Alterar senha <ArrowRight size={16}/></button>
              </form>
            </div>
            {canOperate && <div className="card settings-card"><div className="settings-icon"><Database size={23}/></div><h2>Armazenamento e exportações</h2><p>As exportações utilizam os registros ambientais que já chegaram ao banco do SaaS.</p>
              <button className="outline-button" onClick={() => { void exportCsv(); }}><Download size={17}/> Baixar CSV consolidado</button>
              <div className="settings-info"><span>Fonte</span><strong>PostgreSQL · SENSOR_PAYLOAD</strong><span>Formato</span><strong>CSV UTF-8, separado por ponto e vírgula</strong></div>
            </div>}
            {canAdmin && <div className="card settings-card region-settings-card">
              <div className="settings-icon"><MapPin size={23}/></div>
              <h2>Divisão geográfica — 10 regiões</h2>
              <p>Sobreponha os limites municipais reais ao mapa. Exporte a camada do SIG Rio Preto em GeoJSON, com coordenadas WGS84 (EPSG:4326), e importe o arquivo aqui. Não desenhamos limites estimados.</p>
              <div className="region-import-status">
                <span className={`status-chip ${regionMap?.available ? 'success' : 'warning'}`}><span/>
                  {regionMap?.available ? 'Malha carregada' : 'Malha não importada'}
                </span>
                {regionMap?.updatedAt && <small>Última atualização: {formatDate(regionMap.updatedAt)}</small>}
              </div>
              <form className="station-edit-form" onSubmit={(event) => { void importRegionGeoJSON(event); }}>
                <label>Arquivo oficial GeoJSON
                  <input type="file" accept=".geojson,.json,application/geo+json,application/json"
                    onChange={(event) => setRegionFile(event.target.files?.[0] ?? null)}/>
                </label>
                <label>Endereço da fonte geográfica
                  <input value={regionSource} onChange={(event) => setRegionSource(event.target.value)}
                    placeholder="Endereço da camada no SIG"/>
                </label>
                <button className="primary-button" type="submit" disabled={!regionFile || regionImportBusy}>
                  <MapPin size={16}/> {regionImportBusy ? 'Validando malha...' : 'Importar as 10 regiões'}
                </button>
              </form>
              <p className="region-import-hint">O arquivo precisa conter as 10 regiões como polígonos, com nomes identificáveis nas propriedades. A importação substitui a malha anterior e fica registrada na auditoria.</p>
              <a className="region-source-link" href="https://sig.riopreto.sp.gov.br/portal/home/"
                target="_blank" rel="noreferrer">Abrir SIG Rio Preto</a>
            </div>}
            <div className="card settings-card"><div className="settings-icon"><Server size={23}/></div><h2>Ambiente</h2><p>DengueSaaS Administrative Console</p><div className="settings-info"><span>Conta</span><strong>{user.username}</strong><span>Perfil</span><strong>{user.role === 'ADMIN' ? 'Administrador' : user.role === 'OPERADOR' ? 'Operador' : 'Visualizador'}</strong><span>Monitoramento</span><strong>A cada 15 segundos</strong></div></div>
          </div>}
        </div>
      </div>
    </div>
  );
}
