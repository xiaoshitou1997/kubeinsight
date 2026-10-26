import type { LucideIcon } from 'lucide-react';
import { LoaderCircle, RefreshCw, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { classNames } from '../lib/format';
import { tr } from '../i18n';
import type { ApiError } from '../api';

export type Tone = 'ok' | 'warn' | 'err' | 'info' | 'neutral' | 'muted';

export function Badge({
  children,
  tone = 'neutral',
  dot = true,
  pulse = false,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  title?: string;
}) {
  return (
    <span className={classNames('badge', `badge-${tone}`)} title={title}>
      {dot && <i className={classNames('badge-dot', pulse && 'badge-pulse')} />}
      <span>{children}</span>
    </span>
  );
}

export function Ratio({ ready, total }: { ready: number; total: number }) {
  const tone = total === 0 || ready >= total ? 'ok' : ready === 0 ? 'err' : 'warn';
  return (
    <span className={classNames('ratio', `ratio-${tone}`)}>
      <strong>{ready}</strong>
      <span className="ratio-sep">/</span>
      {total}
    </span>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <LoaderCircle size={size} className="spin" aria-label={tr('加载中')} />;
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  tone,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  active?: boolean;
  tone?: 'danger';
  className?: string;
}) {
  return (
    <button
      type="button"
      className={classNames('icon-btn', active && 'is-active', tone === 'danger' && 'icon-btn-danger', className)}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Icon size={16} />
    </button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={classNames('empty-state', compact && 'empty-state-compact')}>
      <div className="empty-icon">
        <Icon size={22} />
      </div>
      <div className="empty-title">{typeof title === 'string' ? tr(title) : title}</div>
      {description && (
        <div className="empty-desc">
          {typeof description === 'string' ? tr(description) : description}
        </div>
      )}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError | Error | null; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <div className="error-title">{tr('请求失败')}</div>
      <div className="error-message">{error?.message ?? tr('未知错误')}</div>
      {onRetry && (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          <RefreshCw size={14} /> {tr('重试')}
        </button>
      )}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', radius = 6 }: { height?: number | string; width?: number | string; radius?: number }) {
  return <span className="skeleton" style={{ height, width, borderRadius: radius }} />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={classNames('segmented-item', value === option.value && 'is-active')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = '按名称过滤…',
  shortcut,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  shortcut?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className={classNames('search-box', className)}>
      <Search size={15} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={tr(placeholder)}
        autoFocus={autoFocus}
        spellCheck={false}
        aria-label={tr(placeholder)}
      />
      {value ? (
        <button type="button" className="search-clear" onClick={() => onChange('')} aria-label={tr('清除')}>
          <X size={13} />
        </button>
      ) : (
        shortcut && <kbd className="kbd">{shortcut}</kbd>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {Icon && (
          <div className="page-icon">
            <Icon size={19} />
          </div>
        )}
        <div>
          {eyebrow && <div className="eyebrow">{typeof eyebrow === 'string' ? tr(eyebrow) : eyebrow}</div>}
          <h1 className="page-title">{typeof title === 'string' ? tr(title) : title}</h1>
          {description && (
            <div className="page-desc">
              {typeof description === 'string' ? tr(description) : description}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="field">
      <div className="field-label">{tr(label)}</div>
      <div className={classNames('field-value', mono && 'mono')}>{children}</div>
    </div>
  );
}

export function KeyValueChips({ values, limit = 8 }: { values: Record<string, string> | undefined; limit?: number }) {
  if (!values || Object.keys(values).length === 0) return <span className="muted">—</span>;
  const entries = Object.entries(values);
  const shown = entries.slice(0, limit);
  return (
    <div className="chips">
      {shown.map(([key, value]) => (
        <span className="chip" key={key} title={`${key}=${value}`}>
          <span className="chip-key">{key}</span>
          <span className="chip-value">{value}</span>
        </span>
      ))}
      {entries.length > shown.length && <span className="chip chip-more">+{entries.length - shown.length}</span>}
    </div>
  );
}
