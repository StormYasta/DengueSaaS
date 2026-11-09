import { useState } from 'react';
import { CalendarRange, Clock3, Filter } from 'lucide-react';
import type { PeriodSelection, RangePreset, Station } from '../services/api';

type Props = {
  value: PeriodSelection;
  onChange: (value: PeriodSelection) => void;
  stations?: Station[];
  stationId?: string;
  onStationChange?: (value: string) => void;
};

const ranges: { id: RangePreset; title: string }[] = [
  { id: '1h', title: '1h' },
  { id: '6h', title: '6h' },
  { id: '12h', title: '12h' },
  { id: '24h', title: '24h' },
  { id: '7d', title: '7 dias' },
  { id: '30d', title: '30 dias' },
  { id: 'custom', title: 'Personalizado' },
];

function localInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function PeriodControls({
  value, onChange, stations, stationId = '', onStationChange,
}: Props) {
  const [from, setFrom] = useState(() => localInput(new Date(Date.now() - 86_400_000)));
  const [to, setTo] = useState(() => localInput(new Date()));
  const [validation, setValidation] = useState('');

  function chooseRange(range: RangePreset) {
    setValidation('');
    if (range === 'custom') {
      const start = new Date(from);
      const end = new Date(to);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
        setValidation('Preencha as datas para ativar o período personalizado.');
        return;
      }
      onChange({ range: 'custom', from: start.toISOString(), to: end.toISOString() });
    } else {
      onChange({ range });
    }
  }

  function applyCustom() {
    const start = new Date(from);
    const end = new Date(to);
    const duration = end.getTime() - start.getTime();
    if (!Number.isFinite(duration) || duration < 60_000 || duration > 30 * 86_400_000 ||
        end.getTime() > Date.now() + 300_000) {
      setValidation('Escolha um intervalo entre 1 minuto e 30 dias, sem datas futuras.');
      return;
    }
    setValidation('');
    onChange({ range: 'custom', from: start.toISOString(), to: end.toISOString() });
  }

  return (
    <section className="period-controls card" aria-label="Filtros do histórico">
      <div className="period-main-row">
        <div className="period-label"><Clock3 size={16}/><span>Período</span></div>
        <div className="period-presets" role="group" aria-label="Selecionar período">
          {ranges.map((range) => (
            <button key={range.id} type="button" aria-pressed={value.range === range.id}
              className={`period-chip ${value.range === range.id ? 'selected' : ''}`}
              onClick={() => chooseRange(range.id)}>{range.title}</button>
          ))}
        </div>
        {stations && onStationChange && (
          <label className="period-station-select"><Filter size={15}/>
            <select value={stationId} aria-label="Filtrar estação" onChange={(event) => onStationChange(event.target.value)}>
              <option value="">Todas as estações</option>
              {stations.map((station) => <option key={station.id} value={station.id}>{station.slug} — {station.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {value.range === 'custom' && (
        <div className="period-custom-row">
          <CalendarRange size={17}/>
          <label>De<input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)}/></label>
          <label>Até<input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)}/></label>
          <button className="primary-button small" type="button" onClick={applyCustom}>Aplicar período</button>
          {validation && <span className="period-validation" role="alert">{validation}</span>}
        </div>
      )}
    </section>
  );
}
