import { Station } from '../services/api';
import { formatDate, formatDuration, formatPercent, formatTemperature } from '../utils/format';

type StationTableProps = {
  stations: Station[];
  onSelect: (stationId: string) => void;
};

export function StationTable({ stations, onSelect }: StationTableProps) {
  return (
    <div className="card table-card">
      <div className="table-header">
        <h2>Estações</h2>
        <span>{stations.length} cadastradas</span>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Estação</th>
              <th>Status</th>
              <th>CPU</th>
              <th>RAM</th>
              <th>Disco</th>
              <th>Temp</th>
              <th>Serviço</th>
              <th>Último heartbeat</th>
              <th>Último dado</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((station) => (
              <tr key={station.id} onClick={() => onSelect(station.id)}>
                <td>
                  <strong>{station.name}</strong>
                  <small>{station.location ?? station.slug}</small>
                </td>
                <td>
                  <span className={`badge ${station.computedStatus === 'ONLINE' ? 'success' : 'danger'}`}>
                    {station.computedStatus === 'ONLINE' ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td>{formatPercent(station.lastCpuPercent)}</td>
                <td>{formatPercent(station.lastMemoryPercent)}</td>
                <td>{formatPercent(station.lastDiskPercent)}</td>
                <td>{formatTemperature(station.lastTemperatureCelsius)}</td>
                <td>
                  <span className={`badge ${station.serviceStatus === 'RUNNING' ? 'success' : 'warning'}`}>
                    {station.serviceStatus}
                  </span>
                </td>
                <td title={formatDate(station.lastHeartbeatAt)}>{formatDuration(station.secondsSinceHeartbeat)}</td>
                <td>{formatDuration(station.secondsSinceLastData)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
