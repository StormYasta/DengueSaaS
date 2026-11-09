import { Activity, Clock3, RadioTower, ThermometerSun, Wind } from 'lucide-react';
import type { AnalyticsResponse } from '../services/api';
import { formatDate } from '../utils/format';

type Props = {
  analytics: AnalyticsResponse | null;
  fallbackOnline: number;
  fallbackTotal: number;
  scoped: boolean;
};

function decimal(value: number | null, suffix: string, digits = 1) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${suffix}`;
}

function since(at: string | null): string {
  if (!at) return '—';
  const timestamp = Date.parse(at);
  if (!Number.isFinite(timestamp)) return '—';
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours} h`;
  return `Há ${Math.floor(hours / 24)} d`;
}

export function OverviewInsights({ analytics, fallbackOnline, fallbackTotal, scoped }: Props) {
  const online = analytics?.onlineStations ?? fallbackOnline;
  const total = analytics?.totalStations ?? fallbackTotal;
  const fresh = analytics?.freshStations ?? null;
  const temperaturePoints = analytics?.series
    .map((point) => point.temperatura)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)) ?? [];
  const windPoints = analytics?.series
    .map((point) => point.vel_vento)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0) ?? [];

  // Os gráficos já agregam as leituras por estação e faixa temporal. Estes
  // extremos descrevem aquela série agregada, NÃO extremos instantâneos.
  const minTemperature = temperaturePoints.length ? Math.min(...temperaturePoints) : null;
  const maxTemperature = temperaturePoints.length ? Math.max(...temperaturePoints) : null;
  const amplitude = minTemperature !== null && maxTemperature !== null
    ? maxTemperature - minTemperature : null;
  const peakWind = windPoints.length ? Math.max(...windPoints) : null;

  const cards = [
    {
      key: 'network', title: 'Estações online', Icon: RadioTower, color: '#2bcf9d',
      value: `${online} / ${total}`,
      description: total === 0 ? 'Nenhuma estação no escopo' : `${Math.round(online / total * 100)}% da rede conectada agora`,
      tooltip: 'Disponibilidade de conexão no momento. Não representa o histórico do período.',
    },
    {
      key: 'freshness', title: 'Última coleta', Icon: Clock3, color: '#749cff',
      value: since(analytics?.snapshotAt ?? null),
      description: fresh === null ? 'Aguardando dados' : fresh === 0
        ? 'Nenhuma leitura recente' : `${fresh} estação(ões) com dados recentes`,
      tooltip: analytics?.snapshotAt
        ? `Data da coleta mais recente: ${formatDate(analytics.snapshotAt)}`
        : 'Nenhuma leitura válida dos últimos 40 minutos de estações online.',
    },
    {
      key: 'amplitude', title: 'Amplitude térmica', Icon: ThermometerSun, color: '#ffa95c',
      value: decimal(amplitude, '°C'),
      description: minTemperature === null || maxTemperature === null ? 'Sem dados no período'
        : `${decimal(minTemperature, '°C')} a ${decimal(maxTemperature, '°C')}`,
      tooltip: 'Diferença entre o maior e o menor valor da temperatura média por intervalo selecionado, não dos registros instantâneos.',
    },
    {
      key: 'peak-wind', title: 'Pico do vento médio', Icon: Wind, color: '#b995ff',
      value: decimal(peakWind, 'km/h'),
      description: peakWind === null ? 'Sem dados no período' : 'Maior média por intervalo · não é rajada',
      tooltip: 'Maior valor de vento da série agregada do período, não velocidade de rajada do anemômetro.',
    },
  ] as const;

  return (
    <section className="overview-summary-column" aria-label="Situação operacional e extremos">
      <div className="city-summary-head">
        <div>
          <span className="eyebrow">VISÃO OPERACIONAL</span>
          <h2>{scoped ? 'Saúde e extremos da estação' : 'Saúde da rede e extremos'}</h2>
        </div>
        <Activity size={17} className="overview-insight-symbol" aria-hidden="true"/>
      </div>

      <div className="city-summary-grid">
        {cards.map((card) => (
          <article className={`card city-summary-card insight-${card.key}`} key={card.key} title={card.tooltip}>
            <div className="city-card-heading">
              <span>{card.title}</span>
              <card.Icon size={16} style={{ color: card.color }} aria-hidden="true"/>
            </div>
            <strong>{card.value}</strong>
            <small>{card.description}</small>
          </article>
        ))}
      </div>
      <p className="city-disclaimer">
        <Clock3 size={13} aria-hidden="true"/>
        Rede e última coleta: situação atual. Amplitude térmica e vento: extremos das médias no período filtrado.
      </p>
    </section>
  );
}
