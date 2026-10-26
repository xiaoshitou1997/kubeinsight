export function formatAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  if (seconds < 5) return '刚刚';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${minutes % 60 ? `${minutes % 60}m` : ''}`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d${hours % 24 ? `${hours % 24}h` : ''}`;
  return `${Math.floor(days / 365)}y`;
}

export function ageFromTimestamp(timestamp: string | undefined | null): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 1000));
}

export function formatAgeFromTimestamp(timestamp: string | undefined | null): string {
  return formatAge(ageFromTimestamp(timestamp));
}

export function formatDateTime(timestamp: string | undefined | null): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatClock(timestamp: string | number | Date): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatCpu(millis: number | null | undefined): string {
  if (millis === null || millis === undefined || Number.isNaN(millis)) return '—';
  if (millis < 1) return '<1m';
  if (millis < 1000) return `${Math.round(millis)}m`;
  return `${(millis / 1000).toFixed(millis % 1000 === 0 ? 0 : 2)} cores`;
}

export function formatCpuShort(millis: number | null | undefined): string {
  if (millis === null || millis === undefined || Number.isNaN(millis)) return '—';
  if (millis < 1000) return `${Math.round(millis)}m`;
  return `${(millis / 1000).toFixed(1)}`;
}

export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : digits)} ${units[index]}`;
}

export function formatBytesShort(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  const units = ['B', 'K', 'M', 'G', 'T', 'P'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(bytes) || 1) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)}${units[index]}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (value > 0 && value < 1) return '<1%';
  return `${Math.round(value)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function truncate(value: string | undefined | null, max = 48): string {
  if (!value) return '—';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function humanizeReason(reason: string | undefined): string {
  if (!reason) return 'Unknown';
  return reason;
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}
