#!/usr/bin/env python3
"""
Instalador V3 do dashboard ambiental para StormYasta/DengueSaaS.

Características:
- funciona no Windows com Python;
- aceita repositório parcialmente alterado;
- normaliza CRLF/LF;
- cria backup antes das alterações;
- não exige migração do Prisma;
- pode ser executado novamente sem duplicar alterações.

Execute na raiz do repositório:

    py aplicar_dashboard_estacoes_v3.py

ou:

    python aplicar_dashboard_estacoes_v3.py
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
import shutil
import sys


ROOT = Path.cwd()
UTF8 = "utf-8"

FILES_TO_WRITE = {'apps/api/src/routes/heartbeats.ts': "import { FastifyInstance } from 'fastify';\nimport { ServiceStatus, StationStatus } from '@prisma/client';\nimport { z } from 'zod';\nimport { prisma } from '../lib/prisma.js';\n\nconst sensorPayloadSchema = z\n  .object({\n    temperatura: z.number().optional().nullable(),\n    umidade: z.number().optional().nullable(),\n    pressao_abs: z.number().optional().nullable(),\n    pressao_rel: z.number().optional().nullable(),\n    qual_ar: z.number().optional().nullable(),\n    pluviometrico: z.union([z.number(), z.boolean()]).optional().nullable(),\n    chuva_tensao: z.number().optional().nullable(),\n    vel_vento: z.number().optional().nullable(),\n    dir_vento: z.number().optional().nullable(),\n    anemometro_pulsos: z.number().int().nonnegative().optional().nullable(),\n    anemometro_rpm: z.number().nonnegative().optional().nullable(),\n    anemometro_intervalo_s: z.number().nonnegative().optional().nullable(),\n  })\n  .passthrough();\n\nconst heartbeatSchema = z.object({\n  stationSlug: z.string().min(2),\n  stationName: z.string().min(2).optional(),\n  location: z.string().optional(),\n  latitude: z.number().optional().nullable(),\n  longitude: z.number().optional().nullable(),\n  ipAddress: z.string().optional(),\n  agentVersion: z.string().optional(),\n  serviceStatus: z.nativeEnum(ServiceStatus).default(ServiceStatus.UNKNOWN),\n  cpuPercent: z.number().min(0).max(100),\n  memoryPercent: z.number().min(0).max(100),\n  diskPercent: z.number().min(0).max(100),\n  temperatureCelsius: z.number().optional().nullable(),\n  uptimeSeconds: z.number().int().nonnegative().optional(),\n  lastCollectionAt: z.coerce.date().optional().nullable(),\n  recordsLast24h: z.number().int().nonnegative().default(0),\n  sensorPayload: sensorPayloadSchema.optional(),\n});\n\nexport async function heartbeatRoutes(app: FastifyInstance) {\n  app.post('/heartbeats', async (request, reply) => {\n    const body = heartbeatSchema.parse(request.body);\n    const now = new Date();\n\n    const station = await prisma.station.upsert({\n      where: { slug: body.stationSlug },\n      create: {\n        slug: body.stationSlug,\n        name: body.stationName ?? body.stationSlug,\n        location: body.location,\n        latitude: body.latitude ?? null,\n        longitude: body.longitude ?? null,\n        ipAddress: body.ipAddress,\n        agentVersion: body.agentVersion,\n        status: StationStatus.ONLINE,\n        serviceStatus: body.serviceStatus,\n        lastHeartbeatAt: now,\n        lastDataReceivedAt: body.lastCollectionAt ?? null,\n        lastCpuPercent: body.cpuPercent,\n        lastMemoryPercent: body.memoryPercent,\n        lastDiskPercent: body.diskPercent,\n        lastTemperatureCelsius: body.temperatureCelsius ?? null,\n        uptimeSeconds: body.uptimeSeconds,\n      },\n      update: {\n        location: body.location,\n        latitude: body.latitude ?? undefined,\n        longitude: body.longitude ?? undefined,\n        ipAddress: body.ipAddress,\n        agentVersion: body.agentVersion,\n        status: StationStatus.ONLINE,\n        serviceStatus: body.serviceStatus,\n        lastHeartbeatAt: now,\n        lastDataReceivedAt: body.lastCollectionAt ?? undefined,\n        lastCpuPercent: body.cpuPercent,\n        lastMemoryPercent: body.memoryPercent,\n        lastDiskPercent: body.diskPercent,\n        lastTemperatureCelsius: body.temperatureCelsius ?? null,\n        uptimeSeconds: body.uptimeSeconds,\n      },\n    });\n\n    await prisma.heartbeat.create({\n      data: {\n        stationId: station.id,\n        ipAddress: body.ipAddress,\n        agentVersion: body.agentVersion,\n        serviceStatus: body.serviceStatus,\n        cpuPercent: body.cpuPercent,\n        memoryPercent: body.memoryPercent,\n        diskPercent: body.diskPercent,\n        temperatureCelsius: body.temperatureCelsius ?? null,\n        uptimeSeconds: body.uptimeSeconds,\n        lastCollectionAt: body.lastCollectionAt ?? null,\n        recordsLast24h: body.recordsLast24h,\n      },\n    });\n\n    await prisma.metric.create({\n      data: {\n        stationId: station.id,\n        cpuPercent: body.cpuPercent,\n        memoryPercent: body.memoryPercent,\n        diskPercent: body.diskPercent,\n        temperatureCelsius: body.temperatureCelsius ?? null,\n        uptimeSeconds: body.uptimeSeconds,\n      },\n    });\n\n    if (body.sensorPayload) {\n      const metadata = JSON.parse(JSON.stringify(body.sensorPayload));\n\n      await prisma.event.create({\n        data: {\n          stationId: station.id,\n          severity: 'INFO',\n          type: 'SENSOR_PAYLOAD',\n          message: 'Leitura ambiental recebida da estação.',\n          metadata,\n        },\n      });\n    }\n\n    if (body.serviceStatus !== ServiceStatus.RUNNING) {\n      await prisma.event.create({\n        data: {\n          stationId: station.id,\n          severity: 'WARNING',\n          type: 'SERVICE_NOT_RUNNING',\n          message: `Serviço de coleta está com status ${body.serviceStatus}`,\n        },\n      });\n    }\n\n    reply.code(201);\n    return {\n      ok: true,\n      stationId: station.id,\n      receivedAt: now,\n      sensorPayloadReceived: Boolean(body.sensorPayload),\n    };\n  });\n}\n", 'apps/api/src/routes/dashboard.ts': "import { FastifyInstance } from 'fastify';\nimport { prisma } from '../lib/prisma.js';\nimport { isStationOnline, secondsSince } from '../lib/health.js';\n\nexport async function dashboardRoutes(app: FastifyInstance) {\n  app.get('/dashboard', async () => {\n    const stations = await prisma.station.findMany({\n      orderBy: { name: 'asc' },\n      include: {\n        events: {\n          where: { type: 'SENSOR_PAYLOAD' },\n          orderBy: { createdAt: 'desc' },\n          take: 1,\n        },\n      },\n    });\n\n    const enriched = stations.map((station) => {\n      const online = isStationOnline(station);\n      const latestReading = station.events[0];\n      const { events, ...stationData } = station;\n\n      return {\n        ...stationData,\n        computedStatus: online ? 'ONLINE' : 'OFFLINE',\n        secondsSinceHeartbeat: secondsSince(station.lastHeartbeatAt),\n        secondsSinceLastData: secondsSince(station.lastDataReceivedAt),\n        latestSensorPayload: latestReading?.metadata ?? null,\n        latestSensorPayloadAt: latestReading?.createdAt ?? null,\n      };\n    });\n\n    const onlineCount = enriched.filter(\n      (station) => station.computedStatus === 'ONLINE',\n    ).length;\n    const offlineCount = enriched.length - onlineCount;\n    const serviceProblems = enriched.filter(\n      (station) => station.serviceStatus !== 'RUNNING',\n    ).length;\n\n    return {\n      summary: {\n        totalStations: enriched.length,\n        onlineCount,\n        offlineCount,\n        serviceProblems,\n      },\n      stations: enriched,\n    };\n  });\n}\n", 'apps/api/src/routes/stations.ts': "import { FastifyInstance } from 'fastify';\nimport { z } from 'zod';\nimport { prisma } from '../lib/prisma.js';\nimport { isStationOnline, secondsSince } from '../lib/health.js';\n\nconst createStationSchema = z.object({\n  name: z.string().min(2),\n  slug: z.string().min(2).regex(/^[a-zA-Z0-9-_]+$/),\n  location: z.string().optional(),\n  description: z.string().optional(),\n  latitude: z.number().optional(),\n  longitude: z.number().optional(),\n});\n\nexport async function stationRoutes(app: FastifyInstance) {\n  app.get('/stations', async () => {\n    const stations = await prisma.station.findMany({\n      orderBy: { name: 'asc' },\n      include: {\n        events: {\n          where: { type: 'SENSOR_PAYLOAD' },\n          orderBy: { createdAt: 'desc' },\n          take: 1,\n        },\n      },\n    });\n\n    return stations.map((station) => {\n      const latestReading = station.events[0];\n      const { events, ...stationData } = station;\n\n      return {\n        ...stationData,\n        computedStatus: isStationOnline(station) ? 'ONLINE' : 'OFFLINE',\n        secondsSinceHeartbeat: secondsSince(station.lastHeartbeatAt),\n        secondsSinceLastData: secondsSince(station.lastDataReceivedAt),\n        latestSensorPayload: latestReading?.metadata ?? null,\n        latestSensorPayloadAt: latestReading?.createdAt ?? null,\n      };\n    });\n  });\n\n  app.post('/stations', async (request, reply) => {\n    const body = createStationSchema.parse(request.body);\n    const station = await prisma.station.create({ data: body });\n    reply.code(201);\n    return station;\n  });\n\n  app.get('/stations/:id', async (request, reply) => {\n    const params = z.object({ id: z.string() }).parse(request.params);\n\n    const station = await prisma.station.findUnique({\n      where: { id: params.id },\n      include: {\n        metrics: { orderBy: { collectedAt: 'desc' }, take: 60 },\n        events: {\n          where: { type: { not: 'SENSOR_PAYLOAD' } },\n          orderBy: { createdAt: 'desc' },\n          take: 20,\n        },\n        logs: { orderBy: { occurredAt: 'desc' }, take: 50 },\n        commands: { orderBy: { requestedAt: 'desc' }, take: 20 },\n      },\n    });\n\n    if (!station) {\n      return reply.code(404).send({ message: 'Estação não encontrada' });\n    }\n\n    const sensorEvents = await prisma.event.findMany({\n      where: {\n        stationId: station.id,\n        type: 'SENSOR_PAYLOAD',\n      },\n      orderBy: { createdAt: 'desc' },\n      take: 96,\n    });\n\n    const sensorReadings = sensorEvents\n      .map((event) => ({\n        id: event.id,\n        collectedAt: event.createdAt,\n        payload: event.metadata,\n      }))\n      .reverse();\n\n    const latestReading = sensorReadings.at(-1);\n\n    return {\n      ...station,\n      computedStatus: isStationOnline(station) ? 'ONLINE' : 'OFFLINE',\n      secondsSinceHeartbeat: secondsSince(station.lastHeartbeatAt),\n      secondsSinceLastData: secondsSince(station.lastDataReceivedAt),\n      metrics: station.metrics.reverse(),\n      sensorReadings,\n      latestSensorPayload: latestReading?.payload ?? null,\n      latestSensorPayloadAt: latestReading?.collectedAt ?? null,\n    };\n  });\n\n  app.get('/stations/:id/metrics', async (request) => {\n    const params = z.object({ id: z.string() }).parse(request.params);\n    const query = z\n      .object({\n        limit: z.coerce.number().min(1).max(500).default(120),\n      })\n      .parse(request.query);\n\n    const metrics = await prisma.metric.findMany({\n      where: { stationId: params.id },\n      orderBy: { collectedAt: 'desc' },\n      take: query.limit,\n    });\n\n    return metrics.reverse();\n  });\n}\n", 'apps/web/src/components/EnvironmentalDashboard.tsx': 'import type { CSSProperties } from \'react\';\nimport {\n  Activity,\n  CloudRain,\n  Compass,\n  Droplets,\n  Gauge,\n  Navigation,\n  RotateCw,\n  Thermometer,\n  Timer,\n  Wind,\n} from \'lucide-react\';\nimport {\n  CartesianGrid,\n  Legend,\n  Line,\n  LineChart,\n  ResponsiveContainer,\n  Tooltip,\n  XAxis,\n  YAxis,\n} from \'recharts\';\nimport { SensorPayload, SensorReading } from \'../services/api\';\nimport { formatDate } from \'../utils/format\';\n\ntype EnvironmentalDashboardProps = {\n  readings: SensorReading[];\n  latest?: SensorPayload | null;\n  latestAt?: string | null;\n};\n\nfunction numeric(value: unknown): number | null {\n  const parsed = Number(value);\n  return Number.isFinite(parsed) ? parsed : null;\n}\n\nfunction available(value: unknown): number | null {\n  const parsed = numeric(value);\n  return parsed !== null && parsed >= 0 ? parsed : null;\n}\n\nfunction positive(value: unknown): number | null {\n  const parsed = numeric(value);\n  return parsed !== null && parsed > 0 ? parsed : null;\n}\n\nfunction formatValue(\n  value: number | null,\n  suffix: string,\n  digits = 1,\n): string {\n  if (value === null) return \'Sem leitura\';\n\n  return `${value.toLocaleString(\'pt-BR\', {\n    minimumFractionDigits: digits,\n    maximumFractionDigits: digits,\n  })}${suffix}`;\n}\n\nfunction directionLabel(degrees: number | null): string {\n  if (degrees === null || degrees < 0) return \'Indefinida\';\n\n  const labels = [\'N\', \'NE\', \'L\', \'SE\', \'S\', \'SO\', \'O\', \'NO\'];\n  const normalized = ((degrees % 360) + 360) % 360;\n  return labels[Math.round(normalized / 45) % labels.length];\n}\n\nfunction chartTime(value: string) {\n  return new Intl.DateTimeFormat(\'pt-BR\', {\n    hour: \'2-digit\',\n    minute: \'2-digit\',\n  }).format(new Date(value));\n}\n\nexport function EnvironmentalDashboard({\n  readings,\n  latest,\n  latestAt,\n}: EnvironmentalDashboardProps) {\n  const current = latest ?? readings.at(-1)?.payload;\n\n  if (!current) {\n    return (\n      <section className="card environmental-dashboard environmental-empty">\n        <Wind size={28} />\n        <div>\n          <h2>Dashboard ambiental</h2>\n          <p>Nenhuma leitura ambiental completa foi recebida ainda.</p>\n        </div>\n      </section>\n    );\n  }\n\n  const temperature = available(current.temperatura);\n  const humidity = available(current.umidade);\n  const airQuality = available(current.qual_ar);\n  const rainVoltage = available(current.chuva_tensao);\n  const absolutePressure = positive(current.pressao_abs);\n  const relativePressure = positive(current.pressao_rel);\n\n  const windSpeed = available(current.vel_vento);\n  const windDirection = available(current.dir_vento);\n  const windRpm = available(current.anemometro_rpm);\n  const windPulses = available(current.anemometro_pulsos);\n  const windWindow = available(current.anemometro_intervalo_s);\n\n  const raining =\n    current.pluviometrico === true ||\n    Number(current.pluviometrico) === 1;\n\n  const compassStyle = {\n    \'--wind-direction\': `${windDirection ?? 0}deg`,\n  } as CSSProperties;\n\n  const history = readings.map((reading) => ({\n    horario: chartTime(reading.collectedAt),\n    temperatura: numeric(reading.payload.temperatura),\n    umidade: numeric(reading.payload.umidade),\n    qualidadeAr: numeric(reading.payload.qual_ar),\n    vento: numeric(reading.payload.vel_vento),\n    direcao: numeric(reading.payload.dir_vento),\n  }));\n\n  return (\n    <section className="card environmental-dashboard">\n      <div className="environmental-header">\n        <div>\n          <span className="eyebrow">Telemetria ambiental</span>\n          <h2>Dashboard dos sensores da estação</h2>\n          <p>\n            Última leitura: <strong>{formatDate(latestAt)}</strong>\n          </p>\n        </div>\n\n        <span className="live-reading">\n          <i />\n          Payload recebido\n        </span>\n      </div>\n\n      <div className="environmental-kpis">\n        <article>\n          <Thermometer size={22} />\n          <span>Temperatura</span>\n          <strong>{formatValue(temperature, \' °C\')}</strong>\n          <small>DHT22</small>\n        </article>\n\n        <article>\n          <Droplets size={22} />\n          <span>Umidade relativa</span>\n          <strong>{formatValue(humidity, \'%\', 0)}</strong>\n          <small>DHT22</small>\n        </article>\n\n        <article>\n          <Activity size={22} />\n          <span>Qualidade do ar</span>\n          <strong>{formatValue(airQuality, \' ppm\')}</strong>\n          <small>MQ-135</small>\n        </article>\n\n        <article className={raining ? \'rain-detected\' : \'\'}>\n          <CloudRain size={22} />\n          <span>Sensor de chuva</span>\n          <strong>{raining ? \'Chuva detectada\' : \'Sem chuva\'}</strong>\n          <small>{formatValue(rainVoltage, \' V\', 3)}</small>\n        </article>\n      </div>\n\n      <div className="wind-dashboard">\n        <div className="wind-compass" style={compassStyle}>\n          <span className="north">N</span>\n          <span className="east">L</span>\n          <span className="south">S</span>\n          <span className="west">O</span>\n          <div className="compass-inner" />\n          <div className="wind-arrow">\n            <Navigation size={46} fill="currentColor" />\n          </div>\n          <div className="compass-center" />\n        </div>\n\n        <div className="wind-dashboard-content">\n          <span className="eyebrow">Anemômetro</span>\n          <h3>Velocidade e direção do vento</h3>\n\n          <div className="wind-main-values">\n            <div>\n              <small>Velocidade</small>\n              <strong>{formatValue(windSpeed, \' km/h\', 2)}</strong>\n            </div>\n            <div>\n              <small>Direção</small>\n              <strong>\n                {directionLabel(windDirection)}\n                {windDirection !== null\n                  ? ` · ${windDirection.toFixed(0)}°`\n                  : \'\'}\n              </strong>\n            </div>\n          </div>\n\n          <div className="wind-technical-values">\n            <div>\n              <RotateCw size={18} />\n              <span>\n                <small>Rotação</small>\n                <strong>{formatValue(windRpm, \' RPM\', 2)}</strong>\n              </span>\n            </div>\n            <div>\n              <Gauge size={18} />\n              <span>\n                <small>Pulsos</small>\n                <strong>{formatValue(windPulses, \'\', 0)}</strong>\n              </span>\n            </div>\n            <div>\n              <Timer size={18} />\n              <span>\n                <small>Janela</small>\n                <strong>{formatValue(windWindow, \' s\', 2)}</strong>\n              </span>\n            </div>\n            <div>\n              <Compass size={18} />\n              <span>\n                <small>Referência</small>\n                <strong>0° = Norte</strong>\n              </span>\n            </div>\n          </div>\n        </div>\n      </div>\n\n      <div className="environmental-charts">\n        <article className="environmental-chart">\n          <h3>Temperatura e umidade</h3>\n          <ResponsiveContainer width="100%" height={270}>\n            <LineChart data={history}>\n              <CartesianGrid strokeDasharray="3 3" opacity={0.18} />\n              <XAxis dataKey="horario" />\n              <YAxis yAxisId="temperature" />\n              <YAxis yAxisId="humidity" orientation="right" domain={[0, 100]} />\n              <Tooltip />\n              <Legend />\n              <Line\n                yAxisId="temperature"\n                type="monotone"\n                dataKey="temperatura"\n                name="Temperatura °C"\n                stroke="#ff9f43"\n                strokeWidth={2.5}\n                dot={false}\n                connectNulls\n              />\n              <Line\n                yAxisId="humidity"\n                type="monotone"\n                dataKey="umidade"\n                name="Umidade %"\n                stroke="#55abff"\n                strokeWidth={2.5}\n                dot={false}\n                connectNulls\n              />\n            </LineChart>\n          </ResponsiveContainer>\n        </article>\n\n        <article className="environmental-chart">\n          <h3>Vento e qualidade do ar</h3>\n          <ResponsiveContainer width="100%" height={270}>\n            <LineChart data={history}>\n              <CartesianGrid strokeDasharray="3 3" opacity={0.18} />\n              <XAxis dataKey="horario" />\n              <YAxis yAxisId="wind" />\n              <YAxis yAxisId="air" orientation="right" />\n              <Tooltip />\n              <Legend />\n              <Line\n                yAxisId="wind"\n                type="monotone"\n                dataKey="vento"\n                name="Vento km/h"\n                stroke="#2ad37f"\n                strokeWidth={2.5}\n                dot={false}\n                connectNulls\n              />\n              <Line\n                yAxisId="air"\n                type="monotone"\n                dataKey="qualidadeAr"\n                name="Qualidade do ar ppm"\n                stroke="#d685ff"\n                strokeWidth={2.5}\n                dot={false}\n                connectNulls\n              />\n            </LineChart>\n          </ResponsiveContainer>\n        </article>\n      </div>\n\n      <div className="pressure-summary">\n        <div>\n          <span>Pressão absoluta</span>\n          <strong>{formatValue(absolutePressure, \' hPa\')}</strong>\n        </div>\n        <div>\n          <span>Pressão relativa</span>\n          <strong>{formatValue(relativePressure, \' hPa\')}</strong>\n        </div>\n      </div>\n\n      <details className="payload-viewer">\n        <summary>Ver payload JSON completo</summary>\n        <pre>{JSON.stringify(current, null, 2)}</pre>\n      </details>\n    </section>\n  );\n}\n', 'apps/web/src/components/StationTable.tsx': 'import { Station } from \'../services/api\';\nimport {\n  formatDate,\n  formatDuration,\n  formatPercent,\n  formatTemperature,\n} from \'../utils/format\';\n\ntype StationTableProps = {\n  stations: Station[];\n  onSelect: (stationId: string) => void;\n};\n\nfunction formatWind(value?: number | null) {\n  if (value === null || value === undefined || value < 0) return \'-\';\n  return `${value.toFixed(1)} km/h`;\n}\n\nexport function StationTable({ stations, onSelect }: StationTableProps) {\n  return (\n    <div className="card table-card">\n      <div className="table-header">\n        <h2>Estações</h2>\n        <span>{stations.length} cadastradas</span>\n      </div>\n\n      <div className="table-wrapper">\n        <table>\n          <thead>\n            <tr>\n              <th>Estação</th>\n              <th>Status</th>\n              <th>Temperatura</th>\n              <th>Umidade</th>\n              <th>Vento</th>\n              <th>CPU</th>\n              <th>RAM</th>\n              <th>Disco</th>\n              <th>Serviço</th>\n              <th>Último heartbeat</th>\n              <th>Último dado</th>\n            </tr>\n          </thead>\n          <tbody>\n            {stations.map((station) => (\n              <tr key={station.id} onClick={() => onSelect(station.id)}>\n                <td>\n                  <strong>{station.name}</strong>\n                  <small>{station.location ?? station.slug}</small>\n                </td>\n                <td>\n                  <span\n                    className={`badge ${\n                      station.computedStatus === \'ONLINE\'\n                        ? \'success\'\n                        : \'danger\'\n                    }`}\n                  >\n                    {station.computedStatus === \'ONLINE\' ? \'Online\' : \'Offline\'}\n                  </span>\n                </td>\n                <td>\n                  {formatTemperature(\n                    station.latestSensorPayload?.temperatura ??\n                      station.lastTemperatureCelsius,\n                  )}\n                </td>\n                <td>{formatPercent(station.latestSensorPayload?.umidade)}</td>\n                <td>{formatWind(station.latestSensorPayload?.vel_vento)}</td>\n                <td>{formatPercent(station.lastCpuPercent)}</td>\n                <td>{formatPercent(station.lastMemoryPercent)}</td>\n                <td>{formatPercent(station.lastDiskPercent)}</td>\n                <td>\n                  <span\n                    className={`badge ${\n                      station.serviceStatus === \'RUNNING\'\n                        ? \'success\'\n                        : \'warning\'\n                    }`}\n                  >\n                    {station.serviceStatus}\n                  </span>\n                </td>\n                <td title={formatDate(station.lastHeartbeatAt)}>\n                  {formatDuration(station.secondsSinceHeartbeat)}\n                </td>\n                <td>{formatDuration(station.secondsSinceLastData)}</td>\n              </tr>\n            ))}\n          </tbody>\n        </table>\n      </div>\n    </div>\n  );\n}\n', 'apps/web/src/components/OperationMap.tsx': 'import {\n  CircleMarker,\n  MapContainer,\n  Popup,\n  TileLayer,\n  useMap,\n} from \'react-leaflet\';\nimport \'leaflet/dist/leaflet.css\';\nimport { Station } from \'../services/api\';\nimport {\n  formatDuration,\n  formatPercent,\n  formatTemperature,\n} from \'../utils/format\';\n\ntype OperationMapProps = {\n  stations: Station[];\n  onSelect: (stationId: string) => void;\n};\n\nconst center: [number, number] = [-20.8197, -49.3794];\n\nfunction getMarkerColor(station: Station) {\n  if (station.computedStatus === \'OFFLINE\') return \'#ff6b6b\';\n  if (station.serviceStatus !== \'RUNNING\') return \'#f4bf50\';\n  if (\n    (station.lastTemperatureCelsius ?? 0) >= 65 ||\n    (station.lastDiskPercent ?? 0) >= 90\n  ) {\n    return \'#f4bf50\';\n  }\n  return \'#2ad37f\';\n}\n\nfunction formatWind(value?: number | null) {\n  if (value === null || value === undefined || value < 0) return \'-\';\n  return `${value.toFixed(1)} km/h`;\n}\n\nfunction FitMapBounds({ stations }: { stations: Station[] }) {\n  const map = useMap();\n  const points = stations\n    .filter(\n      (station) =>\n        typeof station.latitude === \'number\' &&\n        typeof station.longitude === \'number\',\n    )\n    .map(\n      (station) =>\n        [station.latitude as number, station.longitude as number] as [\n          number,\n          number,\n        ],\n    );\n\n  if (points.length > 1) {\n    window.setTimeout(() => {\n      map.fitBounds(points, { padding: [34, 34], maxZoom: 13 });\n    }, 0);\n  }\n\n  return null;\n}\n\nexport function OperationMap({\n  stations,\n  onSelect,\n}: OperationMapProps) {\n  const mappedStations = stations.filter(\n    (station) =>\n      typeof station.latitude === \'number\' &&\n      typeof station.longitude === \'number\',\n  );\n\n  return (\n    <div className="card map-card">\n      <div className="map-header">\n        <div>\n          <span className="eyebrow">Monitoramento geográfico</span>\n          <h2>Mapa operacional — São José do Rio Preto</h2>\n          <p>\n            Clique em uma estação para consultar o dashboard ambiental.\n          </p>\n        </div>\n        <div className="map-legend">\n          <span><i className="dot success" /> Saudável</span>\n          <span><i className="dot warning" /> Atenção</span>\n          <span><i className="dot danger" /> Offline</span>\n        </div>\n      </div>\n\n      <div className="leaflet-map-area">\n        <MapContainer\n          center={center}\n          zoom={12}\n          scrollWheelZoom\n          className="leaflet-map"\n        >\n          <TileLayer\n            attribution=\'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors\'\n            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"\n          />\n\n          <FitMapBounds stations={mappedStations} />\n\n          {mappedStations.map((station) => {\n            const markerColor = getMarkerColor(station);\n            const sensor = station.latestSensorPayload;\n\n            return (\n              <CircleMarker\n                key={station.id}\n                center={[\n                  station.latitude as number,\n                  station.longitude as number,\n                ]}\n                pathOptions={{\n                  color: markerColor,\n                  fillColor: markerColor,\n                  fillOpacity: 0.92,\n                  weight: 3,\n                }}\n                radius={12}\n                eventHandlers={{ click: () => onSelect(station.id) }}\n              >\n                <Popup>\n                  <div className="map-popup">\n                    <strong>{station.slug} — {station.name}</strong>\n                    <span>\n                      {station.location ?? \'Sem localização cadastrada\'}\n                    </span>\n                    <div className="map-popup-grid">\n                      <small>Status</small><b>{station.computedStatus}</b>\n                      <small>Temperatura</small>\n                      <b>\n                        {formatTemperature(\n                          sensor?.temperatura ??\n                            station.lastTemperatureCelsius,\n                        )}\n                      </b>\n                      <small>Umidade</small>\n                      <b>{formatPercent(sensor?.umidade)}</b>\n                      <small>Vento</small>\n                      <b>{formatWind(sensor?.vel_vento)}</b>\n                      <small>CPU</small>\n                      <b>{formatPercent(station.lastCpuPercent)}</b>\n                      <small>Último dado</small>\n                      <b>{formatDuration(station.secondsSinceLastData)}</b>\n                    </div>\n                    <button\n                      type="button"\n                      onClick={() => onSelect(station.id)}\n                    >\n                      Abrir dashboard\n                    </button>\n                  </div>\n                </Popup>\n              </CircleMarker>\n            );\n          })}\n        </MapContainer>\n      </div>\n    </div>\n  );\n}\n'}
CSS_APPEND = '/* Dashboard ambiental das estações */\n.environmental-dashboard {\n  grid-column: 1 / -1;\n  padding: 24px;\n}\n\n.environmental-header {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 20px;\n  margin-bottom: 20px;\n}\n\n.environmental-header h2 {\n  margin: 4px 0;\n}\n\n.environmental-header p {\n  margin: 0;\n  color: var(--muted);\n}\n\n.live-reading {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  white-space: nowrap;\n  padding: 8px 12px;\n  border: 1px solid rgba(42, 211, 127, 0.26);\n  border-radius: 999px;\n  color: var(--success);\n  background: rgba(42, 211, 127, 0.08);\n  font-size: 0.78rem;\n  font-weight: 800;\n}\n\n.live-reading i {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  background: var(--success);\n  box-shadow: 0 0 0 5px rgba(42, 211, 127, 0.12);\n}\n\n.environmental-kpis {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 12px;\n}\n\n.environmental-kpis article {\n  min-width: 0;\n  padding: 18px;\n  border: 1px solid var(--border);\n  border-radius: 18px;\n  background: rgba(255, 255, 255, 0.035);\n}\n\n.environmental-kpis article > svg {\n  color: var(--success);\n}\n\n.environmental-kpis span,\n.environmental-kpis small,\n.pressure-summary span {\n  display: block;\n  color: var(--muted);\n}\n\n.environmental-kpis span {\n  margin-top: 14px;\n}\n\n.environmental-kpis strong {\n  display: block;\n  margin-top: 5px;\n  overflow: hidden;\n  font-size: clamp(1.05rem, 2vw, 1.45rem);\n  text-overflow: ellipsis;\n}\n\n.environmental-kpis small {\n  margin-top: 7px;\n}\n\n.environmental-kpis .rain-detected {\n  border-color: rgba(85, 171, 255, 0.4);\n  background: rgba(85, 171, 255, 0.1);\n}\n\n.environmental-kpis .rain-detected > svg {\n  color: #55abff;\n}\n\n.wind-dashboard {\n  display: grid;\n  grid-template-columns: 230px minmax(0, 1fr);\n  gap: 26px;\n  align-items: center;\n  margin-top: 16px;\n  padding: 24px;\n  overflow: hidden;\n  border: 1px solid rgba(42, 211, 127, 0.22);\n  border-radius: 22px;\n  background:\n    radial-gradient(circle at left, rgba(42, 211, 127, 0.13), transparent 42%),\n    rgba(255, 255, 255, 0.025);\n}\n\n.wind-compass {\n  position: relative;\n  width: 190px;\n  height: 190px;\n  margin: auto;\n  border: 1px solid var(--border);\n  border-radius: 50%;\n  background:\n    radial-gradient(circle, rgba(42, 211, 127, 0.14) 0 4%, transparent 5%),\n    repeating-conic-gradient(\n      from -1deg,\n      rgba(255, 255, 255, 0.16) 0deg 2deg,\n      transparent 2deg 15deg\n    );\n}\n\n.compass-inner {\n  position: absolute;\n  inset: 19px;\n  border: 1px solid var(--border);\n  border-radius: 50%;\n}\n\n.wind-compass .north,\n.wind-compass .east,\n.wind-compass .south,\n.wind-compass .west {\n  position: absolute;\n  z-index: 2;\n  color: var(--muted);\n  font-size: 0.72rem;\n  font-weight: 900;\n}\n\n.wind-compass .north {\n  top: 8px;\n  left: 50%;\n  transform: translateX(-50%);\n}\n\n.wind-compass .east {\n  top: 50%;\n  right: 9px;\n  transform: translateY(-50%);\n}\n\n.wind-compass .south {\n  bottom: 8px;\n  left: 50%;\n  transform: translateX(-50%);\n}\n\n.wind-compass .west {\n  top: 50%;\n  left: 8px;\n  transform: translateY(-50%);\n}\n\n.wind-arrow {\n  position: absolute;\n  z-index: 3;\n  top: calc(50% - 23px);\n  left: calc(50% - 23px);\n  color: var(--success);\n  transform: rotate(var(--wind-direction));\n  transform-origin: center;\n  filter: drop-shadow(0 6px 15px rgba(42, 211, 127, 0.3));\n}\n\n.compass-center {\n  position: absolute;\n  z-index: 4;\n  top: calc(50% - 6px);\n  left: calc(50% - 6px);\n  width: 12px;\n  height: 12px;\n  border: 3px solid var(--panel);\n  border-radius: 50%;\n  background: var(--success);\n}\n\n.wind-dashboard-content h3 {\n  margin: 5px 0 18px;\n  font-size: clamp(1.35rem, 3vw, 2rem);\n}\n\n.wind-main-values {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 12px;\n}\n\n.wind-main-values > div,\n.pressure-summary > div {\n  padding: 16px;\n  border: 1px solid var(--border);\n  border-radius: 16px;\n  background: rgba(255, 255, 255, 0.035);\n}\n\n.wind-main-values small,\n.wind-main-values strong,\n.pressure-summary strong {\n  display: block;\n}\n\n.wind-main-values small {\n  color: var(--muted);\n}\n\n.wind-main-values strong {\n  margin-top: 6px;\n  font-size: clamp(1.15rem, 2.4vw, 1.75rem);\n}\n\n.wind-technical-values {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 10px;\n  margin-top: 12px;\n}\n\n.wind-technical-values > div {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  min-width: 0;\n  padding: 12px;\n  border: 1px solid var(--border);\n  border-radius: 14px;\n}\n\n.wind-technical-values svg {\n  flex: 0 0 auto;\n  color: var(--success);\n}\n\n.wind-technical-values small,\n.wind-technical-values strong {\n  display: block;\n}\n\n.wind-technical-values small {\n  color: var(--muted);\n  font-size: 0.72rem;\n}\n\n.wind-technical-values strong {\n  margin-top: 3px;\n  font-size: 0.84rem;\n}\n\n.environmental-charts {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 16px;\n  margin-top: 16px;\n}\n\n.environmental-chart {\n  min-width: 0;\n  padding: 18px 14px 8px;\n  border: 1px solid var(--border);\n  border-radius: 18px;\n  background: rgba(255, 255, 255, 0.025);\n}\n\n.environmental-chart h3 {\n  margin: 0 0 12px 8px;\n}\n\n.pressure-summary {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 12px;\n  margin-top: 16px;\n}\n\n.pressure-summary strong {\n  margin-top: 5px;\n}\n\n.payload-viewer {\n  margin-top: 16px;\n  border: 1px solid var(--border);\n  border-radius: 16px;\n  background: rgba(0, 0, 0, 0.1);\n}\n\n.payload-viewer summary {\n  padding: 14px 16px;\n  cursor: pointer;\n  color: var(--muted);\n  font-weight: 750;\n}\n\n.payload-viewer pre {\n  max-height: 360px;\n  margin: 0;\n  padding: 16px;\n  overflow: auto;\n  border-top: 1px solid var(--border);\n  color: #a9f5cf;\n  font-family: "Cascadia Code", "Fira Code", monospace;\n  font-size: 0.82rem;\n  line-height: 1.55;\n}\n\n.environmental-empty {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n}\n\n.environmental-empty svg {\n  color: var(--muted);\n}\n\n.environmental-empty h2 {\n  margin: 0 0 5px;\n}\n\n.environmental-empty p {\n  margin: 0;\n  color: var(--muted);\n}\n\n@media (max-width: 1100px) {\n  .environmental-kpis,\n  .environmental-charts {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n\n  .wind-technical-values {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n}\n\n@media (max-width: 760px) {\n  .environmental-header {\n    flex-direction: column;\n  }\n\n  .wind-dashboard,\n  .environmental-kpis,\n  .environmental-charts,\n  .wind-main-values,\n  .wind-technical-values,\n  .pressure-summary {\n    grid-template-columns: 1fr;\n  }\n}\n'


def fail(message: str) -> None:
    print(f"\n[ERRO] {message}", file=sys.stderr)
    sys.exit(1)


def read_text(relative: str) -> str:
    path = ROOT / relative
    if not path.exists():
        fail(
            f"Arquivo não encontrado: {relative}. "
            "Execute este instalador na raiz do repositório DengueSaaS."
        )

    return path.read_text(encoding=UTF8).replace("\r\n", "\n")


def write_text(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.replace("\r\n", "\n"), encoding=UTF8, newline="\n")


def backup_files(paths: list[str]) -> Path:
    backup_root = (
        ROOT
        / ".backup_dashboard_estacoes_python_v3"
        / datetime.now().strftime("%Y%m%d_%H%M%S")
    )

    for relative in sorted(set(paths)):
        source = ROOT / relative
        if not source.exists():
            continue

        destination = backup_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    print(f"Backup criado em: {backup_root}")
    return backup_root


def replace_once(
    relative: str,
    *,
    label: str,
    marker: str,
    old: str,
    new: str,
) -> None:
    content = read_text(relative)

    if marker in content:
        print(f"[OK] {label} já estava aplicado")
        return

    old = old.replace("\r\n", "\n")
    new = new.replace("\r\n", "\n")

    count = content.count(old)
    if count != 1:
        fail(
            f"Não foi possível aplicar '{label}' em {relative}. "
            f"Esperado 1 trecho, encontrado: {count}."
        )

    write_text(relative, content.replace(old, new, 1))
    print(f"[OK] {label}")


def regex_insert_after(
    relative: str,
    *,
    label: str,
    marker: str,
    pattern: str,
    addition: str,
) -> None:
    content = read_text(relative)

    if marker in content:
        print(f"[OK] {label} já estava aplicado")
        return

    match = re.search(pattern, content, flags=re.MULTILINE)
    if not match:
        fail(f"Não foi possível localizar o ponto de inserção de '{label}' em {relative}.")

    updated = content[: match.end()] + addition + content[match.end() :]
    write_text(relative, updated)
    print(f"[OK] {label}")


required_files = [
    "agent/estacao_dojot_saas.py",
    "apps/web/src/App.tsx",
    "apps/web/src/services/api.ts",
    "apps/web/src/styles.css",
    "apps/api/src/routes/heartbeats.ts",
    "apps/api/src/routes/dashboard.ts",
    "apps/api/src/routes/stations.ts",
    "apps/web/src/components/StationTable.tsx",
    "apps/web/src/components/OperationMap.tsx",
]

for relative in required_files:
    if not (ROOT / relative).exists():
        fail(
            f"Arquivo obrigatório ausente: {relative}. "
            "Confirme que este script está na raiz do DengueSaaS."
        )

backup_files(required_files + list(FILES_TO_WRITE.keys()))

# ---------------------------------------------------------------------------
# AGENTE DA RASPBERRY
# ---------------------------------------------------------------------------

replace_once(
    "agent/estacao_dojot_saas.py",
    label="telemetria detalhada do anemômetro",
    marker="return vel_kmh, pulsos, rpm, dt",
    old="""def ler_velocidade_vento():
    global contador_pulsos, ultimo_tempo_leitura
    agora = time.time()
    dt = agora - ultimo_tempo_leitura
    pulsos = contador_pulsos
    contador_pulsos = 0
    ultimo_tempo_leitura = agora

    if dt <= 0:
        return 0.0

    rpm = (pulsos * 60.0) / dt
    vel_ms = ((4 * math.pi * RAIO_ANEMOMETRO_MM * rpm) / 60.0) / 1000.0
    return vel_ms * 3.6
""",
    new="""def ler_velocidade_vento():
    global contador_pulsos, ultimo_tempo_leitura

    agora = time.time()
    dt = agora - ultimo_tempo_leitura
    pulsos = contador_pulsos

    contador_pulsos = 0
    ultimo_tempo_leitura = agora

    if dt <= 0:
        return 0.0, pulsos, 0.0, 0.0

    rpm = (pulsos * 60.0) / dt
    vel_ms = ((4 * math.pi * RAIO_ANEMOMETRO_MM * rpm) / 60.0) / 1000.0
    vel_kmh = vel_ms * 3.6

    return vel_kmh, pulsos, rpm, dt
""",
)

regex_insert_after(
    "agent/estacao_dojot_saas.py",
    label="sensorPayload no heartbeat",
    marker='"sensorPayload": payload,',
    pattern=r'^[ \t]*"recordsLast24h"[ \t]*:[ \t]*96,[ \t]*$',
    addition='\n        "sensorPayload": payload,',
)

replace_once(
    "agent/estacao_dojot_saas.py",
    label="captura ampliada do anemômetro",
    marker="anemometro_intervalo,\n        ) = ler_velocidade_vento()",
    old="""        vel_vento = ler_velocidade_vento()
        dir_vento = ler_direcao_vento()
""",
    new="""        (
            vel_vento,
            anemometro_pulsos,
            anemometro_rpm,
            anemometro_intervalo,
        ) = ler_velocidade_vento()
        dir_vento = ler_direcao_vento()
""",
)

replace_once(
    "agent/estacao_dojot_saas.py",
    label="payload SaaS completo",
    marker="payload_saas = {",
    old="""        salvar_csv(payload)
        enviar_dojot(payload)
        enviar_saas(payload)

        time.sleep(READ_INTERVAL_SECONDS)
""",
    new="""        payload_saas = {
            **payload,
            "chuva_tensao": round(v_chuva, 3),
            "anemometro_pulsos": int(anemometro_pulsos),
            "anemometro_rpm": round(anemometro_rpm, 2),
            "anemometro_intervalo_s": round(anemometro_intervalo, 2),
        }

        salvar_csv(payload)
        enviar_dojot(payload)
        enviar_saas(payload_saas)

        time.sleep(READ_INTERVAL_SECONDS)
""",
)

# ---------------------------------------------------------------------------
# FRONTEND — APP
# ---------------------------------------------------------------------------

replace_once(
    "apps/web/src/App.tsx",
    label="import do dashboard ambiental",
    marker="import { EnvironmentalDashboard }",
    old="import { StationTable } from './components/StationTable';\n",
    new=(
        "import { StationTable } from './components/StationTable';\n"
        "import { EnvironmentalDashboard } from './components/EnvironmentalDashboard';\n"
    ),
)

replace_once(
    "apps/web/src/App.tsx",
    label="dashboard ambiental na tela de detalhes",
    marker="<EnvironmentalDashboard",
    old="""          <MetricsChart metrics={selectedStation.metrics} />

          <div className="card logs-card">
""",
    new="""          <MetricsChart metrics={selectedStation.metrics} />

          <EnvironmentalDashboard
            readings={selectedStation.sensorReadings}
            latest={selectedStation.latestSensorPayload}
            latestAt={selectedStation.latestSensorPayloadAt}
          />

          <div className="card logs-card">
""",
)

# ---------------------------------------------------------------------------
# FRONTEND — TIPOS E DADOS LOCAIS
# ---------------------------------------------------------------------------

replace_once(
    "apps/web/src/services/api.ts",
    label="renovar cache do modo de apresentação",
    marker="dengue-saas-presentation-data-v2",
    old="const STORAGE_KEY = 'dengue-saas-presentation-data-v1';",
    new="const STORAGE_KEY = 'dengue-saas-presentation-data-v2';",
)

replace_once(
    "apps/web/src/services/api.ts",
    label="tipos ambientais",
    marker="export type SensorPayload = {",
    old="export type Station = {\n",
    new="""export type SensorPayload = {
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

export type Station = {
""",
)

replace_once(
    "apps/web/src/services/api.ts",
    label="último payload ambiental da estação",
    marker="latestSensorPayload?: SensorPayload | null;",
    old="""  secondsSinceHeartbeat?: number | null;
  secondsSinceLastData?: number | null;
};
""",
    new="""  secondsSinceHeartbeat?: number | null;
  secondsSinceLastData?: number | null;
  latestSensorPayload?: SensorPayload | null;
  latestSensorPayloadAt?: string | null;
};
""",
)

replace_once(
    "apps/web/src/services/api.ts",
    label="histórico ambiental no detalhe",
    marker="sensorReadings: SensorReading[];",
    old="""export type StationDetail = Station & {
  metrics: Metric[];
  events: Array<{ id: string; severity: string; type: string; message: string; createdAt: string }>;
  logs: Array<{ id: string; level: string; message: string; source?: string | null; occurredAt: string }>;
};
""",
    new="""export type StationDetail = Station & {
  metrics: Metric[];
  sensorReadings: SensorReading[];
  events: Array<{ id: string; severity: string; type: string; message: string; createdAt: string }>;
  logs: Array<{ id: string; level: string; message: string; source?: string | null; occurredAt: string }>;
};
""",
)

replace_once(
    "apps/web/src/services/api.ts",
    label="gerador local do histórico ambiental",
    marker="function sensorHistory(",
    old="function createStation(input: {\n",
    new="""function sensorHistory(stationId: string, slug: string): SensorReading[] {
  const index = Number(slug.replace(/\\D/g, '')) || 1;

  return Array.from({ length: 48 }).map((_, point) => {
    const wave = Math.sin(point / 5);
    const wind = Math.max(0, 4.5 + index * 0.6 + wave * 3.2);
    const direction = (index * 45 + point * 4) % 360;
    const rpm = wind / 0.07917;
    const interval = 900;
    const pulses = Math.round((rpm * interval) / 60);

    return {
      id: `${stationId}-sensor-${point}`,
      collectedAt: minutesAgo((47 - point) * 30),
      payload: {
        temperatura: Number((24 + index * 0.45 + wave * 2.2).toFixed(1)),
        umidade: Number((62 - wave * 9 - index).toFixed(0)),
        pressao_abs: 0,
        pressao_rel: 0,
        qual_ar: Number((410 + index * 18 + wave * 35).toFixed(1)),
        pluviometrico: point % 19 === 0 ? 1 : 0,
        chuva_tensao: point % 19 === 0 ? 1.22 : 2.84,
        vel_vento: Number(wind.toFixed(2)),
        dir_vento: Number(direction.toFixed(0)),
        anemometro_pulsos: pulses,
        anemometro_rpm: Number(rpm.toFixed(2)),
        anemometro_intervalo_s: interval,
      },
    };
  });
}

function createStation(input: {
""",
)

replace_once(
    "apps/web/src/services/api.ts",
    label="dados ambientais no modo de apresentação",
    marker="sensorReadings: sensorHistory(input.id, input.slug),",
    old="""    secondsSinceHeartbeat: input.heartbeatAgo === null ? null : input.heartbeatAgo * 60,
    secondsSinceLastData: input.dataAgo === null ? null : input.dataAgo * 60,
    metrics: metricHistory(input.id, input.cpu, input.memory, input.disk, input.temp),
    events: input.events,
""",
    new="""    secondsSinceHeartbeat: input.heartbeatAgo === null ? null : input.heartbeatAgo * 60,
    secondsSinceLastData: input.dataAgo === null ? null : input.dataAgo * 60,
    metrics: metricHistory(input.id, input.cpu, input.memory, input.disk, input.temp),
    sensorReadings: sensorHistory(input.id, input.slug),
    latestSensorPayload: sensorHistory(input.id, input.slug).at(-1)?.payload ?? null,
    latestSensorPayloadAt: sensorHistory(input.id, input.slug).at(-1)?.collectedAt ?? null,
    events: input.events,
""",
)

# ---------------------------------------------------------------------------
# API E COMPONENTES — ARQUIVOS COMPLETOS
# ---------------------------------------------------------------------------

for relative, content in FILES_TO_WRITE.items():
    write_text(relative, content)
    print(f"[OK] Arquivo atualizado: {relative}")

# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------

styles_path = "apps/web/src/styles.css"
styles = read_text(styles_path)

if "min-width: 1240px;" not in styles:
    styles = styles.replace(
        "table { width: 100%; border-collapse: collapse; min-width: 980px; }",
        "table { width: 100%; border-collapse: collapse; min-width: 1240px; }",
        1,
    )

if "/* Dashboard ambiental das estações */" not in styles:
    styles = styles.rstrip() + "\n\n" + CSS_APPEND

write_text(styles_path, styles)
print("[OK] CSS do dashboard atualizado")

print("\nDashboard ambiental aplicado com sucesso.")
print("\nPróximos passos:")
print("  1. docker compose -f docker-compose.prod.yml up -d --build")
print("  2. Copiar agent/estacao_dojot_saas.py para a Raspberry")
print("  3. Reiniciar o serviço da estação")
