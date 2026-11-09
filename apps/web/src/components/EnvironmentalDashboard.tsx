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
import { SensorPayload, SensorReading } from '../services/api';
import { formatDate } from '../utils/format';
import { MeasurementCharts } from './MeasurementCharts';

type EnvironmentalDashboardProps = {
  readings: SensorReading[];
  latest?: SensorPayload | null;
  latestAt?: string | null;
};

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
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
    at: reading.collectedAt,
    temperatura: available(reading.payload.temperatura),
    umidade: available(reading.payload.umidade),
    qual_ar: available(reading.payload.qual_ar),
    vel_vento: available(reading.payload.vel_vento),
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
          <strong>{formatValue(airQuality, '')}</strong>
          <small>MQ-135 · leitura bruta (não ppm)</small>
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

      <MeasurementCharts
        points={history}
        heading="Histórico dos sensores"
        description="Cada indicador tem seu próprio gráfico e eixo. Valores ausentes não são interpolados."
      />

      {(absolutePressure !== null || relativePressure !== null) && (
        <div className="pressure-summary">
          {absolutePressure !== null && <div><span>Pressão absoluta</span><strong>{formatValue(absolutePressure, ' hPa')}</strong></div>}
          {relativePressure !== null && <div><span>Pressão relativa</span><strong>{formatValue(relativePressure, ' hPa')}</strong></div>}
        </div>
      )}

      <details className="payload-viewer">
        <summary>Ver payload JSON completo</summary>
        <pre>{JSON.stringify(current, null, 2)}</pre>
      </details>
    </section>
  );
}
