import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Droplets, FlaskConical, Thermometer, Wind } from 'lucide-react';
import type { EnvironmentalPoint, EnvironmentalValues } from '../services/api';

type MetricKey = keyof EnvironmentalValues;
const definitions = [
  { key: 'temperatura' as MetricKey, label: 'Temperatura', unit: '°C', color: '#ffad61', Icon: Thermometer, description: 'Temperatura do ambiente' },
  { key: 'umidade' as MetricKey, label: 'Umidade relativa', unit: '%', color: '#5aaeff', Icon: Droplets, description: 'Umidade do ambiente' },
  { key: 'vel_vento' as MetricKey, label: 'Velocidade do vento', unit: 'km/h', color: '#27cf9d', Icon: Wind, description: 'Leituras do anemômetro' },
  { key: 'qual_ar' as MetricKey, label: 'Qualidade do ar', unit: 'índice', color: '#b58bff', Icon: FlaskConical, description: 'Leitura bruta do MQ-135 · não calibrada em ppm' },
];

export function formattedMeasure(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const digits = unit === '%' ? 0 : unit === 'índice' ? 2 : 1;
  const formatted = value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return `${formatted} ${unit === 'índice' ? '' : unit}`.trim();
}

function axisLabel(value: string, broad: boolean) {
  const date = new Date(value);
  return broad
    ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

type Props = {
  points: EnvironmentalPoint[];
  heading?: string;
  description?: string;
  emptyMessage?: string;
};

export function MeasurementCharts({ points, heading, description, emptyMessage }: Props) {
  const first = points[0] ? new Date(points[0].at).getTime() : Date.now();
  const last = points.at(-1) ? new Date(points.at(-1)!.at).getTime() : Date.now();
  const broad = last - first > 36 * 3_600_000;

  const visible = definitions.filter((metric) =>
    points.some((point) => typeof point[metric.key] === 'number' && Number.isFinite(point[metric.key])));

  return <section className="measurement-section">
    {(heading || description) && <div className="measurement-section-heading">
      {heading && <h2>{heading}</h2>}
      {description && <p>{description}</p>}
    </div>}
    {!visible.length && <div className="card measurement-empty">{emptyMessage ?? 'Sem dados ambientais no período selecionado.'}</div>}
    <div className="measurement-grid">
      {visible.map((metric) => {
        const valid = points.filter((point) => typeof point[metric.key] === 'number' && Number.isFinite(point[metric.key]));
        const lastValue = valid.at(-1)?.[metric.key] ?? null;
        const gradientId = `analytics-${metric.key}`;
        return <article className="card measurement-card" key={metric.key}>
          <div className="measurement-card-head">
            <span className="measurement-symbol" style={{ color: metric.color, backgroundColor: `${metric.color}17` }}>
              <metric.Icon size={19}/>
            </span>
            <span className="measurement-card-subtitle">{valid.length} intervalos com leitura</span>
          </div>
          <div className="measurement-card-title"><h3>{metric.label}</h3>
            <strong>{formattedMeasure(lastValue, metric.unit)}</strong>
            <small>Último valor no período</small>
          </div>
          <div className="measurement-chart-area" role="img" aria-label={`Histórico de ${metric.label} com ${valid.length} intervalos`}>
            <ResponsiveContainer width="100%" height={205}>
              <AreaChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={metric.color} stopOpacity={0.20}/>
                    <stop offset="95%" stopColor={metric.color} stopOpacity={0.005}/>
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5"/>
                <XAxis dataKey="at" tickFormatter={(v) => axisLabel(String(v), broad)}
                  tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false}
                  minTickGap={30} tickMargin={10} />
                <YAxis domain={metric.key === 'umidade' ? [0, 100] : metric.key === 'temperatura' ? ['auto', 'auto'] : [0, 'auto']}
                  tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false}
                  width={42} tickFormatter={(v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/>
                <Tooltip
                  labelFormatter={(value) => new Date(String(value)).toLocaleString('pt-BR')}
                  formatter={(value) => [formattedMeasure(Number(value), metric.unit), metric.label]}
                  contentStyle={{ background: '#142034', border: '1px solid #34445b', borderRadius: 10, fontSize: 12, color: '#fff' }}
                />
                <Area type="linear" dataKey={metric.key} name={metric.label}
                  stroke={metric.color} strokeWidth={2.6} fill={`url(#${gradientId})`}
                  connectNulls={false} dot={valid.length < 12 ? { r: 2 } : false}
                  activeDot={{ r: 5 }} isAnimationActive={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="measurement-note">{metric.description}</p>
        </article>;
      })}
    </div>
  </section>;
}
