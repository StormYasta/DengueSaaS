import type { CSSProperties } from 'react';
import {
  Activity,
  CloudRain,
  Compass,
  Droplets,
  Gauge,
  Navigation,
  RotateCw,
  Thermometer,
  Timer,
  Wind,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SensorPayload, SensorReading } from '../services/api';
import { formatDate } from '../utils/format';

type EnvironmentalDashboardProps = {
  readings: SensorReading[];
  latest?: SensorPayload | null;
  latestAt?: string | null;
};

function numeric(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function available(value: unknown): number | null {
  const parsed = numeric(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function positive(value: unknown): number | null {
  const parsed = numeric(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function formatValue(
  value: number | null,
  suffix: string,
  digits = 1,
): string {
  if (value === null) return 'Sem leitura';

  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}${suffix}`;
}

function directionLabel(degrees: number | null): string {
  if (degrees === null || degrees < 0) return 'Indefinida';

  const labels = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const normalized = ((degrees % 360) + 360) % 360;
  return labels[Math.round(normalized / 45) % labels.length];
}

function chartTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function EnvironmentalDashboard({
  readings,
  latest,
  latestAt,
}: EnvironmentalDashboardProps) {
  const current = latest ?? readings.at(-1)?.payload;

  if (!current) {
    return (
      <section className="card environmental-dashboard environmental-empty">
        <Wind size={28} />
        <div>
          <h2>Dashboard ambiental</h2>
          <p>Nenhuma leitura ambiental completa foi recebida ainda.</p>
        </div>
      </section>
    );
  }

  const temperature = available(current.temperatura);
  const humidity = available(current.umidade);
  const airQuality = available(current.qual_ar);
  const rainVoltage = available(current.chuva_tensao);
  const absolutePressure = positive(current.pressao_abs);
  const relativePressure = positive(current.pressao_rel);

  const windSpeed = available(current.vel_vento);
  const windDirection = available(current.dir_vento);
  const windRpm = available(current.anemometro_rpm);
  const windPulses = available(current.anemometro_pulsos);
  const windWindow = available(current.anemometro_intervalo_s);

  const raining =
    current.pluviometrico === true ||
    Number(current.pluviometrico) === 1;

  const compassStyle = {
    '--wind-direction': `${windDirection ?? 0}deg`,
  } as CSSProperties;

  const history = readings.map((reading) => ({
    horario: chartTime(reading.collectedAt),
    temperatura: numeric(reading.payload.temperatura),
    umidade: numeric(reading.payload.umidade),
    qualidadeAr: numeric(reading.payload.qual_ar),
    vento: numeric(reading.payload.vel_vento),
    direcao: numeric(reading.payload.dir_vento),
  }));

  return (
    <section className="card environmental-dashboard">
      <div className="environmental-header">
        <div>
          <span className="eyebrow">Telemetria ambiental</span>
          <h2>Dashboard dos sensores da estação</h2>
          <p>
            Última leitura: <strong>{formatDate(latestAt)}</strong>
          </p>
        </div>

        <span className="live-reading">
          <i />
          Payload recebido
        </span>
      </div>

      <div className="environmental-kpis">
        <article>
          <Thermometer size={22} />
          <span>Temperatura</span>
          <strong>{formatValue(temperature, ' °C')}</strong>
          <small>DHT22</small>
        </article>

        <article>
          <Droplets size={22} />
          <span>Umidade relativa</span>
          <strong>{formatValue(humidity, '%', 0)}</strong>
          <small>DHT22</small>
        </article>

        <article>
          <Activity size={22} />
          <span>Qualidade do ar</span>
          <strong>{formatValue(airQuality, ' ppm')}</strong>
          <small>MQ-135</small>
        </article>

        <article className={raining ? 'rain-detected' : ''}>
          <CloudRain size={22} />
          <span>Sensor de chuva</span>
          <strong>{raining ? 'Chuva detectada' : 'Sem chuva'}</strong>
          <small>{formatValue(rainVoltage, ' V', 3)}</small>
        </article>
      </div>

      <div className="wind-dashboard">
        <div className="wind-compass" style={compassStyle}>
          <span className="north">N</span>
          <span className="east">L</span>
          <span className="south">S</span>
          <span className="west">O</span>
          <div className="compass-inner" />
          <div className="wind-arrow">
            <Navigation size={46} fill="currentColor" />
          </div>
          <div className="compass-center" />
        </div>

        <div className="wind-dashboard-content">
          <span className="eyebrow">Anemômetro</span>
          <h3>Velocidade e direção do vento</h3>

          <div className="wind-main-values">
            <div>
              <small>Velocidade</small>
              <strong>{formatValue(windSpeed, ' km/h', 2)}</strong>
            </div>
            <div>
              <small>Direção</small>
              <strong>
                {directionLabel(windDirection)}
                {windDirection !== null
                  ? ` · ${windDirection.toFixed(0)}°`
                  : ''}
              </strong>
            </div>
          </div>

          <div className="wind-technical-values">
            <div>
              <RotateCw size={18} />
              <span>
                <small>Rotação</small>
                <strong>{formatValue(windRpm, ' RPM', 2)}</strong>
              </span>
            </div>
            <div>
              <Gauge size={18} />
              <span>
                <small>Pulsos</small>
                <strong>{formatValue(windPulses, '', 0)}</strong>
              </span>
            </div>
            <div>
              <Timer size={18} />
              <span>
                <small>Janela</small>
                <strong>{formatValue(windWindow, ' s', 2)}</strong>
              </span>
            </div>
            <div>
              <Compass size={18} />
              <span>
                <small>Referência</small>
                <strong>0° = Norte</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="environmental-charts">
        <article className="environmental-chart">
          <h3>Temperatura e umidade</h3>
          <ResponsiveContainer width="100%" height={270}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
              <XAxis dataKey="horario" />
              <YAxis yAxisId="temperature" />
              <YAxis yAxisId="humidity" orientation="right" domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="temperature"
                type="monotone"
                dataKey="temperatura"
                name="Temperatura °C"
                stroke="#ff9f43"
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="humidity"
                type="monotone"
                dataKey="umidade"
                name="Umidade %"
                stroke="#55abff"
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </article>

        <article className="environmental-chart">
          <h3>Vento e qualidade do ar</h3>
          <ResponsiveContainer width="100%" height={270}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
              <XAxis dataKey="horario" />
              <YAxis yAxisId="wind" />
              <YAxis yAxisId="air" orientation="right" />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="wind"
                type="monotone"
                dataKey="vento"
                name="Vento km/h"
                stroke="#2ad37f"
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="air"
                type="monotone"
                dataKey="qualidadeAr"
                name="Qualidade do ar ppm"
                stroke="#d685ff"
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </article>
      </div>

      <div className="pressure-summary">
        <div>
          <span>Pressão absoluta</span>
          <strong>{formatValue(absolutePressure, ' hPa')}</strong>
        </div>
        <div>
          <span>Pressão relativa</span>
          <strong>{formatValue(relativePressure, ' hPa')}</strong>
        </div>
      </div>

      <details className="payload-viewer">
        <summary>Ver payload JSON completo</summary>
        <pre>{JSON.stringify(current, null, 2)}</pre>
      </details>
    </section>
  );
}
