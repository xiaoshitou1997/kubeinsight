import { RefreshCw, ScrollText, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { resourceForKind } from '../catalog';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Badge, EmptyState, ErrorState, PageHeader, SearchBox, Segmented } from '../components/ui';
import { useApiQuery, useDebounced, useDocumentTitle } from '../hooks';
import { formatAgeFromTimestamp, formatDateTime } from '../lib/format';
import type { EventsResponse, KubeEvent } from '../types';

type EventFilter = 'all' | 'Warning' | 'Normal';

export function EventsPage() {
  useDocumentTitle('事件');
  const { cluster, namespace, openResource, refreshNow } = useApp();
  const [filter, setFilter] = useState<EventFilter>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 220);

  const query = useApiQuery<EventsResponse>(
    '/api/events',
    {
      cluster,
      namespace: namespace || undefined,
      type: filter === 'all' ? undefined : filter,
      q: debounced || undefined,
      limit: 500,
    },
    { enabled: Boolean(cluster) },
  );

  const items = query.data?.items ?? [];
  const warnings = useMemo(() => items.filter((item) => item.type === 'Warning').length, [items]);
  const objects = useMemo(
    () => new Set(items.map((item) => `${item.kind}/${item.namespace}/${item.name}`)).size,
    [items],
  );

  const openEventObject = (event: KubeEvent) => {
    const def = resourceForKind(event.kind);
    if (!def) return;
    openResource({
      key: def.key,
      group: def.group,
      version: def.version,
      plural: def.plural,
      kind: def.kind,
      namespace: event.namespace,
      name: event.name,
      namespaced: def.namespaced,
    });
  };

  const columns: Array<TableColumn<KubeEvent>> = [
    {
      key: 'type',
      header: 'TYPE',
      width: '88px',
      render: (event) => (
        <Badge tone={event.type === 'Warning' ? 'warn' : 'info'} dot={false}>
          {event.type ?? 'Normal'}
        </Badge>
      ),
      sortValue: (event) => event.type,
    },
    {
      key: 'reason',
      header: 'REASON',
      width: '140px',
      render: (event) => (
        <span className="mono" title={event.component ? `来源：${event.component}` : undefined}>
          {event.reason}
        </span>
      ),
      sortValue: (event) => event.reason,
    },
    {
      key: 'object',
      header: 'OBJECT',
      width: '260px',
      render: (event) => (
        <span className="event-object">
          <span className="kind-chip">{event.kind}</span>
          <span className="mono">{event.name}</span>
        </span>
      ),
      sortValue: (event) => `${event.kind}/${event.name}`,
    },
    {
      key: 'namespace',
      header: 'NAMESPACE',
      width: '120px',
      render: (event) => <span className="mono muted">{event.namespace || '—'}</span>,
      sortValue: (event) => event.namespace,
    },
    {
      key: 'message',
      header: 'MESSAGE',
      render: (event) => (
        <span className="message-cell" title={event.message}>
          {event.message}
        </span>
      ),
      sortValue: (event) => event.message,
    },
    {
      key: 'count',
      header: 'COUNT',
      width: '70px',
      render: (event) => <span className="mono muted">{event.count}</span>,
      sortValue: (event) => event.count,
    },
    {
      key: 'lastSeen',
      header: 'LAST SEEN',
      width: '100px',
      render: (event) => (
        <span className="mono muted" title={formatDateTime(event.lastSeen)}>
          {formatAgeFromTimestamp(event.lastSeen)}
        </span>
      ),
      sortValue: (event) => (event.lastSeen ? Date.parse(event.lastSeen) : 0),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        icon={ScrollText}
        eyebrow="EVENTS"
        title="事件中心"
        description="Kubernetes 事件默认保留 1 小时；告警事件通常指向调度失败、镜像拉取或探针异常。"
        actions={
          <>
            <span className="refresh-meta">
              {items.length} 条 · {objects} 个对象
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshNow}>
              <RefreshCw size={14} className={query.loading ? 'spin' : ''} /> 刷新
            </button>
          </>
        }
      />

      <div className="event-summary">
        <div className="event-summary-item">
          <span>Warning</span>
          <strong className={warnings > 0 ? 'text-warn' : ''}>{warnings}</strong>
        </div>
        <div className="event-summary-item">
          <span>Normal</span>
          <strong>{items.length - warnings}</strong>
        </div>
        <div className="event-summary-item">
          <span>涉及对象</span>
          <strong>{objects}</strong>
        </div>
        <div className="event-summary-item">
          <span>命名空间</span>
          <strong className="mono">{namespace || '全部'}</strong>
        </div>
      </div>

      <div className="list-toolbar">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部' },
            { value: 'Warning', label: 'Warning' },
            { value: 'Normal', label: 'Normal' },
          ]}
          ariaLabel="事件类型"
        />
        <SearchBox value={search} onChange={setSearch} placeholder="搜索原因、消息或对象…" />
        <span className="muted list-toolbar-hint">点击事件行可打开关联资源</span>
      </div>

      {query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <DataTable
          rows={items}
          columns={columns}
          rowKey={(event) => String(event.uid ?? `${event.reason}-${event.lastSeen}-${event.name}`)}
          loading={query.loading}
          onRowClick={openEventObject}
          className="events-table"
          empty={
            <EmptyState
              icon={search ? SearchX : ScrollText}
              title={search ? '没有匹配的事件' : '当前没有事件'}
              description={
                search ? '尝试调整关键字或切换事件类型。' : '集群近期没有产生 Warning 或 Normal 事件。'
              }
              compact
            />
          }
        />
      )}
    </div>
  );
}
