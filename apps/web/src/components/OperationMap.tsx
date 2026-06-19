import { MapPin } from 'lucide-react';
import { Station } from '../services/api';

type OperationMapProps = {
  stations: Station[];
  onSelect: (stationId: string) => void;
};

const bounds = {
  minLat: -20.9,
  maxLat: -20.76,
  minLng: -49.47,
  maxLng: -49.28,
};

function getPointPosition(station: Station) {
  const latitude = station.latitude ?? bounds.minLat;
  const longitude = station.longitude ?? bounds.minLng;

  const x = ((longitude - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
  const y = (1 - (latitude - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;

  return {
    left: `${Math.min(94, Math.max(6, x))}%`,
    top: `${Math.min(90, Math.max(8, y))}%`,
  };
}

function getStatusClass(station: Station) {
  if (station.computedStatus === 'OFFLINE') return 'danger';
  if (station.serviceStatus !== 'RUNNING') return 'warning';
  if ((station.lastTemperatureCelsius ?? 0) >= 65 || (station.lastDiskPercent ?? 0) >= 90) return 'warning';
  return 'success';
}

export function OperationMap({ stations, onSelect }: OperationMapProps) {
  const mappedStations = stations.filter((station) => station.latitude && station.longitude);

  return (
    <div className="card map-card">
      <div className="map-header">
        <div>
          <span className="eyebrow">Monitoramento geográfico</span>
          <h2>Mapa operacional — São José do Rio Preto</h2>
          <p>Mock com estações distribuídas em pontos de referência inspirados na rede de UBS.</p>
        </div>
        <div className="map-legend">
          <span><i className="dot success" /> Saudável</span>
          <span><i className="dot warning" /> Atenção</span>
          <span><i className="dot danger" /> Offline</span>
        </div>
      </div>

      <div className="map-area">
        <div className="map-grid" />
        <span className="map-label north">Zona Norte</span>
        <span className="map-label center">Centro</span>
        <span className="map-label south">Zona Sul</span>
        <span className="map-label east">Leste</span>
        <span className="map-label west">Oeste</span>

        {mappedStations.map((station) => (
          <button
            key={station.id}
            className={`map-marker ${getStatusClass(station)}`}
            style={getPointPosition(station)}
            onClick={() => onSelect(station.id)}
            title={`${station.name} — ${station.location ?? ''}`}
          >
            <MapPin size={18} />
            <span>{station.slug}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
