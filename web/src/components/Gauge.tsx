import { classNames } from '../lib/format';
import { tr } from '../i18n';
import type { Tone } from './ui';

const COLORS: Record<string, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  err: 'var(--err)',
  info: 'var(--accent-blue)',
  accent: 'var(--accent)',
};

export function toneForPercent(value: number | null | undefined): Tone {
  if (value === null || value === undefined) return 'muted';
  if (value >= 90) return 'err';
  if (value >= 70) return 'warn';
  return 'ok';
}

export function Ring({
  value,
  size = 76,
  stroke = 7,
  label,
  color,
}: {
  value: number | null | undefined;
  size?: number;
  stroke?: number;
  label?: string;
  color?: string;
}) {
  const safe = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const tone = toneForPercent(value);
  const strokeColor = color ?? COLORS[tone] ?? COLORS.accent;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - safe / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 500ms ease' }}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-value">{value === null || value === undefined ? '—' : `${Math.round(value)}%`}</span>
        {label && <span className="ring-label">{tr(label)}</span>}
      </div>
    </div>
  );
}

export function Meter({
  value,
  tone,
  label,
  detail,
  compact,
}: {
  value: number | null | undefined;
  tone?: Tone;
  label?: string;
  detail?: string;
  compact?: boolean;
}) {
  const safe = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  const resolved = tone ?? toneForPercent(value);
  return (
    <div className={classNames('meter', compact && 'meter-compact')}>
      {(label || detail) && (
        <div className="meter-head">
          <span className="meter-label">{label ? tr(label) : ''}</span>
          <span className={classNames('meter-detail', `text-${resolved}`)}>{detail ?? `${Math.round(safe)}%`}</span>
        </div>
      )}
      <div className="meter-track">
        <span
          className={classNames('meter-fill', `meter-${resolved}`)}
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}

export function PhaseDonut({
  segments,
  size = 132,
  thickness = 14,
  centerLabel,
  centerValue,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: number | string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={tr('Pod 阶段分布')}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={thickness} />
        {segments.map((segment) => {
          if (segment.value === 0) return null;
          const fraction = total > 0 ? segment.value / total : 0;
          const dash = fraction * circumference;
          const element = (
            <circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: 'stroke-dasharray 500ms ease' }}
            />
          );
          offset += dash;
          return element;
        })}
      </svg>
      <div className="donut-center">
        <span className="donut-value">{centerValue ?? total}</span>
        {centerLabel && <span className="donut-label">{centerLabel}</span>}
      </div>
    </div>
  );
}
