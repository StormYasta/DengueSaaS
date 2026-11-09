import { useEffect, useState } from 'react';
import { geoJSON } from 'leaflet';
import type { Feature } from 'geojson';
import { Layers3, MapPinned } from 'lucide-react';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { RegionMapResponse, Station } from '../services/api';
import {
  formatDuration,
  formatPercent,
  formatTemperature,
} from '../utils/format';

type OperationMapProps = {
  stations: Station[];
  onSelect: (stationId: string) => void;
  regions?: RegionMapResponse | null;
  selectedRegion?: string;
  onRegionSelect?: (regionName: string) => void;
};

const palette = [
  '#9d87fa', '#39b7a4', '#faa96b', '#6aa5ff', '#d888d7',
  '#74c79a', '#e9c16a', '#8da0ff', '#c8859b', '#61cad7',
];
const regionNames = [
  'Bosque', 'Central', 'CEU', 'Cidade da Criança', 'HB',
  'Pinheirinho', 'Represa', 'Schmitt', 'Talhado', 'Vila Toninho',
];
function regionColor(name: string) {
  const idx = regionNames.indexOf(name);
  return palette[idx >= 0 ? idx : 0];
}

const center: [number, number] = [-20.8197, -49.3794];

function getMarkerColor(station: Station) {
  if (station.computedStatus === 'OFFLINE') return '#ff6b6b';
  if (station.serviceStatus !== 'RUNNING') return '#f4bf50';
  if (
    (station.lastTemperatureCelsius ?? 0) >= 65 ||
    (station.lastDiskPercent ?? 0) >= 90
  ) {
    return '#f4bf50';
  }
  return '#2ad37f';
}

function formatWind(value?: number | null) {
  if (value === null || value === undefined || value < 0) return '-';
  return `${value.toFixed(1)} km/h`;
}

function FitMapBounds({ stations, skip }: { stations: Station[]; skip: boolean }) {
  const map = useMap();
  const signature = stations
    .filter((station) => typeof station.latitude === 'number' && typeof station.longitude === 'number')
    .map((station) => `${station.latitude},${station.longitude}`)
    .sort().join('|');

  useEffect(() => {
    if (skip) return;
    const points = signature.split('|').filter(Boolean).map((point) =>
      point.split(',').map(Number) as [number, number]);
    if (points.length > 1) map.fitBounds(points, { padding: [34, 34], maxZoom: 13 });
  }, [map, signature, skip]);

  return null;
}

function FitRegionBounds({ regions, selectedRegion, show }: {
  regions?: RegionMapResponse | null;
  selectedRegion: string;
  show: boolean;
}) {
  const map = useMap();
  const geojson = regions?.geojson;
  const timestamp = regions?.updatedAt;

  useEffect(() => {
    if (!geojson || !show) return;
    const features = selectedRegion
      ? geojson.features.filter((feature) => feature.properties.name === selectedRegion)
      : geojson.features;
    if (!features.length) return;
    const selectedCollection = { ...geojson, features };
    const bounds = geoJSON(selectedCollection).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [25, 25], maxZoom: 13 });
  }, [map, geojson, timestamp, selectedRegion, show]);
  return null;
}

export function OperationMap({
  stations,
  onSelect,
  regions,
  selectedRegion = '',
  onRegionSelect,
}: OperationMapProps) {
  const [showRegions, setShowRegions] = useState(true);
  const polygons = regions?.geojson;
  const hasRegions = Boolean(polygons?.features.length);
  const mappedStations = stations.filter(
    (station) =>
      typeof station.latitude === 'number' &&
      typeof station.longitude === 'number',
  );

  return (
    <div className="card map-card">
      <div className="map-header">
        <div>
          <span className="eyebrow">Monitoramento geográfico</span>
          <h2>Mapa operacional — São José do Rio Preto</h2>
          <p>
            Clique em uma estação para consultar o dashboard ambiental.
          </p>
        </div>
        <div className="map-header-actions">
          <div className="map-legend">
            <span><i className="dot success" /> Saudável</span>
            <span><i className="dot warning" /> Atenção</span>
            <span><i className="dot danger" /> Offline</span>
          </div>
          {hasRegions && <button type="button" className={`map-layer-switch ${showRegions ? 'active' : ''}`}
            aria-pressed={showRegions} onClick={() => {
              if (showRegions && selectedRegion && onRegionSelect) onRegionSelect('');
              setShowRegions(!showRegions);
            }}>
            <Layers3 size={16} /> {showRegions ? 'Ocultar regiões' : 'Mostrar regiões'}
          </button>}
          {hasRegions && onRegionSelect && <label className="map-region-picker">
            <MapPinned size={15}/>
            <select value={selectedRegion} onChange={(e) => onRegionSelect(e.target.value)} aria-label="Filtrar microregião">
              <option value="">Todas as regiões</option>
              {regionNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>}
        </div>
      </div>

      <div className="leaflet-map-area">
        <MapContainer
          center={center}
          zoom={12}
          scrollWheelZoom
          className="leaflet-map map-basemap-muted"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitMapBounds stations={mappedStations} skip={showRegions && hasRegions}/>
          <FitRegionBounds regions={regions} selectedRegion={selectedRegion} show={showRegions}/>

          {showRegions && polygons && <GeoJSON
            key={`${regions?.updatedAt ?? ''}-${selectedRegion}`}
            data={polygons}
            style={(feature) => {
              const name = String(feature?.properties?.name ?? '');
              const selected = selectedRegion === name;
              return {
                color: regionColor(name),
                weight: selected ? 3.6 : 2.1,
                fillColor: regionColor(name),
                fillOpacity: selected ? 0.28 : 0.16,
                opacity: selected ? 1 : 0.94,
              };
            }}
            onEachFeature={(feature: Feature, layer) => {
              const name = String(feature.properties?.name ?? '');
              layer.bindTooltip(name, {
                permanent: true,
                direction: 'center',
                className: 'region-name-tooltip',
                opacity: 0.95,
              });
              if (onRegionSelect) layer.on('click', () => onRegionSelect(selectedRegion === name ? '' : name));
            }}
          />}

          {mappedStations.map((station) => {
            const markerColor = getMarkerColor(station);
            const sensor = station.latestSensorPayload;

            return (
              <CircleMarker
                key={station.id}
                center={[
                  station.latitude as number,
                  station.longitude as number,
                ]}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: markerColor,
                  fillOpacity: 1,
                  weight: 3,
                  className: 'station-status-marker',
                }}
                radius={12}
                eventHandlers={{ click: () => onSelect(station.id) }}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>{station.slug} — {station.name}</strong>
                    <span>
                      {station.location ?? 'Sem localização cadastrada'}
                    </span>
                    <div className="map-popup-grid">
                      <small>Status</small><b>{station.computedStatus}</b>
                      <small>Temperatura</small>
                      <b>
                        {formatTemperature(
                          sensor?.temperatura ??
                            station.lastTemperatureCelsius,
                        )}
                      </b>
                      <small>Umidade</small>
                      <b>{formatPercent(sensor?.umidade)}</b>
                      <small>Vento</small>
                      <b>{formatWind(sensor?.vel_vento)}</b>
                      <small>CPU</small>
                      <b>{formatPercent(station.lastCpuPercent)}</b>
                      <small>Último dado</small>
                      <b>{formatDuration(station.secondsSinceLastData)}</b>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelect(station.id)}
                    >
                      Abrir dashboard
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <div className="region-map-source">
        {hasRegions
          ? <span>Divisão municipal em 10 regiões · camada importada de base geográfica. {regions?.source ? `Fonte declarada: ${regions.source}` : 'Fonte não informada.'}</span>
          : <span>Camada das 10 regiões ainda não importada. Adicione a malha GeoJSON oficial em Configurações.</span>}
        <a href="https://sig.riopreto.sp.gov.br/portal/home/" target="_blank" rel="noreferrer">SIG Rio Preto</a>
      </div>
    </div>
  );
}
