import {
  Activity,
  Box,
  ListTree,
  LoaderCircle,
  Search,
  ScrollText,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext';
import { NAV_GROUPS, RESOURCES, resourceForKind } from '../catalog';
import { useApiQuery, useDebounced } from '../hooks';
import { tr, useLang } from '../i18n';
import { classNames } from '../lib/format';
import { statusTone } from '../lib/kube';
import type { SearchResponse } from '../types';
import { Badge, Kbd } from './ui';

interface PaletteEntry {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
  status?: string;
  badge?: string;
  run: () => void;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { cluster, namespace, openResource } = useApp();
  const lang = useLang();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query.trim(), 180);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const search = useApiQuery<SearchResponse>(
    '/api/search',
    { cluster, q: debounced, namespace: namespace || undefined, limit: 30 },
    { enabled: debounced.length > 0 },
  );

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const navEntries = useMemo<PaletteEntry[]>(() => {
    const entries: PaletteEntry[] = [
      {
        id: 'overview',
        group: tr('导航'),
        label: tr('集群概览'),
        sub: tr('节点、Pod、事件与资源压力'),
        icon: Activity,
        run: () => navigate('/'),
      },
    ];
    for (const group of NAV_GROUPS) {
      for (const key of group.keys) {
        const resource = RESOURCES[key];
        if (!resource) continue;
        entries.push({
          id: `nav-${key}`,
          group: tr('导航'),
          label: resource.label,
          sub: tr(group.label),
          icon: resource.icon,
          run: () => navigate(`/r/${key}`),
        });
      }
    }
    entries.push(
      {
        id: 'events',
        group: tr('导航'),
        label: tr('事件'),
        sub: tr('集群事件流'),
        icon: ScrollText,
        run: () => navigate('/events'),
      },
      {
        id: 'explorer',
        group: tr('导航'),
        label: 'API Explorer',
        sub: tr('浏览全部 API 资源与 CRD'),
        icon: ListTree,
        run: () => navigate('/explorer'),
      },
      {
        id: 'settings',
        group: tr('导航'),
        label: tr('设置与权限'),
        sub: tr('集群、身份与偏好'),
        icon: Settings,
        run: () => navigate('/settings'),
      },
    );
    return entries;
  }, [navigate, lang]);

  const lower = query.trim().toLowerCase();

  const filteredNav = useMemo(() => {
    if (!lower) return navEntries;
    return navEntries.filter((entry) =>
      `${entry.label} ${entry.sub ?? ''} ${entry.id}`.toLowerCase().includes(lower),
    );
  }, [navEntries, lower]);

  const resourceEntries = useMemo<PaletteEntry[]>(() => {
    if (!search.data) return [];
    return search.data.items.map((item) => {
      const def = resourceForKind(item.kind, item.group);
      return {
        id: `res-${item.kind}-${item.namespace ?? ''}-${item.name}`,
        group: tr('资源'),
        label: item.name,
        sub: item.namespace
          ? `${item.kind} · ${item.namespace}`
          : `${item.kind} · ${tr('集群级')}`,
        icon: def?.icon ?? Box,
        badge: def?.label ?? item.kind,
        status: item.status,
        run: () =>
          openResource({
            key: def?.key,
            group: item.group,
            version: item.version,
            plural: item.plural,
            kind: item.kind,
            namespace: item.namespace,
            name: item.name,
            namespaced: Boolean(item.namespace),
          }),
      };
    });
  }, [search.data, openResource, lang]);

  const entries = useMemo(() => [...filteredNav, ...resourceEntries], [filteredNav, resourceEntries]);

  useEffect(() => {
    setActive(0);
  }, [query, search.data]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const execute = (entry: PaletteEntry | undefined) => {
    if (!entry) return;
    entry.run();
    if (entry.group !== tr('资源')) onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((value) => Math.min(entries.length - 1, value + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) => Math.max(0, value - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      execute(entries[active]);
    }
  };

  let lastGroup = '';

  return createPortal(
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label={tr('资源搜索')}>
        <div className="palette-input-row">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={tr('搜索跨命名空间的 Pod、Deployment、Service、Node…')}
            spellCheck={false}
            aria-label={tr('搜索资源')}
          />
          {search.loading ? <LoaderCircle size={16} className="spin" /> : <Kbd>ESC</Kbd>}
        </div>

        <div className="palette-results" ref={listRef}>
          {entries.length === 0 && !search.loading && (
            <div className="palette-empty">
              {tr('没有找到与', 'No resources matching')} <strong>{query}</strong>{' '}
              {tr('匹配的资源', '')}
            </div>
          )}
          {entries.map((entry, index) => {
            const Icon = entry.icon;
            const showGroup = entry.group !== lastGroup;
            lastGroup = entry.group;
            return (
              <div key={entry.id}>
                {showGroup && <div className="palette-group">{entry.group}</div>}
                <button
                  type="button"
                  data-index={index}
                  className={classNames('palette-item', index === active && 'is-active')}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => execute(entry)}
                >
                  <span className="palette-item-icon">
                    <Icon size={15} />
                  </span>
                  <span className="palette-item-text">
                    <span className="palette-item-label">{entry.label}</span>
                    {entry.sub && <span className="palette-item-sub">{entry.sub}</span>}
                  </span>
                  {entry.status && (
                    <Badge tone={statusTone(entry.status)} dot={false}>
                      {entry.status}
                    </Badge>
                  )}
                  {entry.badge && !entry.status && <span className="palette-kind">{entry.badge}</span>}
                </button>
              </div>
            );
          })}
          {search.loading && entries.length === 0 && (
            <div className="palette-empty">{tr('正在搜索集群资源…')}</div>
          )}
        </div>

        <div className="palette-footer">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> {tr('选择')}</span>
          <span><Kbd>↵</Kbd> {tr('打开')}</span>
          <span><Kbd>esc</Kbd> {tr('关闭')}</span>
          <span className="palette-footer-hint">{tr('支持跨命名空间模糊匹配')}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
