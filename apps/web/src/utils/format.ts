export function formatPercent(value?: number | null): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(0)}%`;
}

export function formatTemperature(value?: number | null): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}°C`;
}

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

export function formatDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '-';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
