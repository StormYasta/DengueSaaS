import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Station } from '../services/api';
import { formatDuration, formatPercent, formatTemperature } from '../utils/format';

type OperationMapProps = {
  stations: Station[];
  onSelect: (stationId: string) => void;
};

const center: [number, number] = [-20.8197, -49.3794];

function getMarkerColor(station: Station) {
  if (station.computedStatus === 'OFFLINE') return '#ff6b6b';
  if (station.serviceStatus !== 'RUNNING') return '#f4bf50';
  if ((station.lastTemperatureCelsius ?? 0) >= 65 || (station.lastDiskPercent ?? 0) >= 90) return '#f4bf50';
  return '#2ad37f';
}

function FitMapBounds({ stations }: { stations: Station[] }) {
  const map = useMap();
  const points = stations
    .filter((station) => typeof station.latitude === 'number' && typeof station.longitude === 'number')
    .map((station) => [station.latitude as number, station.longitude as number] as [number, number]);

  if (points.length > 1) {
    window.setTimeout(() => {
      map.fitBounds(points, { padding: [34, 34], maxZoom: 13 });
    }, 0);
  }

  return null;
}

export function OperationMap({ stations, onSelect }: OperationMapProps) {
  const mappedStations = stations.filter(
    (station) => typeof station.latitude === 'number' && typeof station.longitude === 'number',
  );

  return (
    <div className="card map-card">
      <div className="map-header">
        <div>
          <span className="eyebrow">Monitoramento geográfico</span>
          <h2>Mapa operacional — São José do Rio Preto</h2>
          <p>Estações de demonstração posicionadas em referências territoriais inspiradas em UBS.</p>
        </div>
        <div className="map-legend">
          <span><i className="dot success" /> Saudável</span>
          <span><i className="dot warning" /> Atenção</span>
          <span><i className="dot danger" /> Offline</span>
        </div>
      </div>

      <div className="leaflet-map-area">
        <MapContainer center={center} zoom={12} scrollWheelZoom className="leaflet-map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitMapBounds stations={mappedStations} />

          {mappedStations.map((station) => {
            const markerColor = getMarkerColor(station);

            return (
              <CircleMarker
                key={station.id}
                center={[station.latitude as number, station.longitude as number]}
                pathOptions={{ color: markerColor, fillColor: markerColor, fillOpacity: 0.92, weight: 3 }}
                radius={12}
                eventHandlers={{ click: () => onSelect(station.id) }}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>{station.slug} — {station.name}</strong>
                    <span>{station.location ?? 'Sem localização cadastrada'}</span>
                    <div className="map-popup-grid">
                      <small>Status</small><b>{station.computedStatus}</b>
                      <small>Serviço</small><b>{station.serviceStatus}</b>
                      <small>CPU</small><b>{formatPercent(station.lastCpuPercent)}</b>
                      <small>RAM</small><b>{formatPercent(station.lastMemoryPercent)}</b>
                      <small>Disco</small><b>{formatPercent(station.lastDiskPercent)}</b>
                      <small>Temp.</small><b>{formatTemperature(station.lastTemperatureCelsius)}</b>
                      <small>Último dado</small><b>{formatDuration(station.secondsSinceLastData)}</b>
                    </div>
                    <button type="button" onClick={() => onSelect(station.id)}>Ver detalhes</button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
