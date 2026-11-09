import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { SystemPoint } from '../services/api';

type SystemKey = 'cpuPercent' | 'memoryPercent' | 'diskPercent' | 'temperatureCelsius';
const measures: { key: SystemKey; label: string; unit: string; color: string; percentage: boolean }[] = [
  { key: 'cpuPercent', label: 'CPU', unit: '%', color: '#af95ff', percentage: true },
  { key: 'memoryPercent', label: 'Memória RAM', unit: '%', color: '#5daff8', percentage: true },
  { key: 'diskPercent', label: 'Disco', unit: '%', color: '#32d3a0', percentage: true },
  { key: 'temperatureCelsius', label: 'Temperatura da Raspberry', unit: '°C', color: '#ffad61', percentage: false },
];

export function MetricsChart({ metrics }: { metrics: SystemPoint[] }) {
  const hasHistory = metrics.some((point) => measures.some((measure) => point[measure.key] !== null));
  return <section className="card chart-card system-metrics-card">
    <div className="measurement-section-heading"><h2>Saúde da Raspberry Pi</h2><p>Histórico operacional no período selecionado · eixos individuais</p></div>
    {!hasHistory ? <p className="muted">Nenhuma métrica do sistema no período.</p>
      : <div className="system-metrics-grid">
        {measures.map((metric) => {
          const rows = metrics.filter((item) => item[metric.key] !== null);
          if (!rows.length) return null;
          const latest = rows.at(-1)?.[metric.key];
          return <article key={metric.key} className="system-metric">
            <div className="system-metric-heading"><span>{metric.label}</span><strong style={{ color: metric.color }}>
              {latest === undefined || latest === null ? '—' : `${latest.toFixed(1)} ${metric.unit}`}
            </strong></div>
            <ResponsiveContainer width="100%" height={135}>
              <LineChart data={metrics} margin={{ top: 10, right: 10, bottom: 0, left: -22 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5"/>
                <XAxis dataKey="at" tickFormatter={(v) => new Date(String(v)).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  tick={{ fontSize: 9, fill: 'var(--muted)' }} minTickGap={30} axisLine={false} tickLine={false}/>
                <YAxis domain={metric.percentage ? [0, 100] : ['auto', 'auto']}
                  tick={{ fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false}/>
                <Tooltip labelFormatter={(v) => new Date(String(v)).toLocaleString('pt-BR')}
                  formatter={(v) => [`${Number(v).toFixed(1)} ${metric.unit}`, metric.label]}
                  contentStyle={{ background: '#142034', border: '1px solid #34445b', borderRadius: 10, color: 'white' }}/>
                <Line type="linear" dataKey={metric.key} stroke={metric.color} strokeWidth={2.3}
                  dot={false} connectNulls={false} isAnimationActive={false}/>
              </LineChart>
            </ResponsiveContainer>
          </article>;
        })}
      </div>}
  </section>;
}
