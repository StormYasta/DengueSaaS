import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Metric } from '../services/api';

type MetricsChartProps = {
  metrics: Metric[];
};

export function MetricsChart({ metrics }: MetricsChartProps) {
  const data = metrics.map((metric) => ({
    time: new Date(metric.collectedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    CPU: metric.cpuPercent,
    RAM: metric.memoryPercent,
    Disco: metric.diskPercent,
    Temp: metric.temperatureCelsius ?? 0,
  }));

  return (
    <div className="card chart-card">
      <h2>Histórico de métricas</h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="CPU" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="RAM" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Disco" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Temp" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
