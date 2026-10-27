import { Plus, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../AppContext';
import { RESOURCES, resourceTemplates } from '../catalog';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Meter } from '../components/Gauge';
import { QuickActionsMenu } from '../components/QuickActions';
import { ApplyYamlModal } from '../components/YamlEditor';
import { EmptyState, ErrorState, PageHeader, SearchBox } from '../components/ui';
import {
  useApiQuery,
  useDocumentTitle,
  useResourceWatch,
  type QueryResult,
  type ResourceWatchMessage,
} from '../hooks';
import { tr } from '../i18n';
import { formatPercent } from '../lib/format';
import type { KubeObject, ListResponse, MetricsResponse } from '../types';
import { NotFoundPage } from './NotFoundPage';

export function ResourceListPage() {
  const { key = '' } = useParams();
  const def = RESOURCES[key];
  const { cluster, namespace, openResource, refreshNow, refreshInterval, can, notify } = useApp();
  const [search, setSearch] = useState('');
  const [extraItems, setExtraItems] = useState<KubeObject[]>([]);
  const [continueToken, setContinueToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useDocumentTitle(tr(def?.label ?? '资源'));

  const watchParams = {
    cluster,
    group: def?.group,
    version: def?.version,
    plural: def?.plural,
    namespace: def?.namespaced ? namespace || undefined : undefined,
    limit: 250,
  };
  const queryRef = useRef<QueryResult<ListResponse> | null>(null);
  const handleWatchMessage = (message: ResourceWatchMessage<ListResponse>) => {
    const query = queryRef.current;
    if (!query) return;
    if (message.kind === 'snapshot') {
      query.setData(message.data);
      return;
    }
    if (message.kind !== 'event') return;

    query.setData((current) => {
      if (!current) return current;
      const event = message.event;
      if (event.type === 'BOOKMARK') {
        return event.resourceVersion
          ? { ...current, resourceVersion: event.resourceVersion }
          : current;
      }
      if (event.type === 'ERROR') return current;
      const object = event.object;
      if (!object) return current;

      const id = watchObjectId(object);
      let items = current.items ?? [];
      if (event.type === 'ADDED') {
        if (!items.some((item) => watchObjectId(item) === id)) items = [...items, object];
      } else if (event.type === 'MODIFIED') {
        items = items.map((item) => (watchObjectId(item) === id ? object : item));
      } else if (event.type === 'DELETED') {
        items = items.filter((item) => watchObjectId(item) !== id);
      }
      return {
        ...current,
        items,
        resourceVersion: object.metadata?.resourceVersion ?? current.resourceVersion,
      };
    });
  };
  const watch = useResourceWatch<ListResponse>(
    '/api/watch',
    watchParams,
    Boolean(def),
    handleWatchMessage,
  );

  const query = useApiQuery<ListResponse>('/api/resources', watchParams, {
    enabled: Boolean(def),
    pausePolling: watch.status === 'live',
  });
  queryRef.current = query;

  const metrics = useApiQuery<MetricsResponse>(
    '/api/metrics',
    { cluster, nodesOnly: key === 'nodes' ? 1 : undefined },
    { enabled: key === 'nodes' },
  );

  useEffect(() => {
    setExtraItems([]);
    setContinueToken(query.data?.continue ?? null);
  }, [query.data?.continue, key, namespace, cluster]);

  useEffect(() => {
    setSearch('');
  }, [key]);

  const rows = useMemo(() => {
    const merged = [...(query.data?.items ?? []), ...extraItems];
    const seen = new Set<string>();
    return merged.filter((item) => {
      const id = String(item.metadata?.uid ?? `${item.metadata?.namespace}/${item.metadata?.name}`);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [query.data, extraItems]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = search.trim().toLowerCase();
    return rows.filter((item) =>
      `${item.metadata?.name ?? ''} ${item.metadata?.namespace ?? ''}`.toLowerCase().includes(needle),
    );
  }, [rows, search]);

  const loadMore = async () => {
    if (!continueToken || !def || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await api<ListResponse>('/api/resources', {
        cluster,
        group: def.group,
        version: def.version,
        plural: def.plural,
        namespace: def.namespaced ? namespace || undefined : undefined,
        limit: 250,
        continue: continueToken,
      });
      setExtraItems((current) => [...current, ...response.items]);
      setContinueToken(response.continue);
    } catch (error) {
      notify((error as Error).message, 'err');
    } finally {
      setLoadingMore(false);
    }
  };

  if (!def) return <NotFoundPage />;

  const canCreate = can({ group: def.group, plural: def.plural }, 'create');
  const canQuickEdit = can({ group: def.group, plural: def.plural }, 'patch');
  const templateNamespace = def.namespaced ? namespace || 'default' : 'default';
  const templates = resourceTemplates(templateNamespace);

  const columns: Array<TableColumn<KubeObject>> = [
    {
      key: 'name',
      header: 'NAME',
      render: (object) => (
        <span className="name-link" title={object.metadata?.name}>
          {object.metadata?.name}
        </span>
      ),
      sortValue: (object) => object.metadata?.name ?? '',
    },
    ...(def.namespaced && !namespace
      ? [
          {
            key: 'namespace',
            header: 'NAMESPACE',
            width: '160px',
            render: (object: KubeObject) => (
              <span className="mono muted">{object.metadata?.namespace ?? '—'}</span>
            ),
            sortValue: (object: KubeObject) => object.metadata?.namespace ?? '',
          } as TableColumn<KubeObject>,
        ]
      : []),
    ...(def.columns as Array<TableColumn<KubeObject>>),
  ];

  if (key === 'nodes' && metrics.data?.available) {
    const nodeMetrics = new Map(metrics.data.nodes.map((node) => [node.name, node]));
    const usageColumn = (kind: 'cpu' | 'memory'): TableColumn<KubeObject> => ({
      key: `usage-${kind}`,
      header: kind === 'cpu' ? 'CPU' : 'MEM',
      width: '120px',
      render: (object) => {
        const usage = nodeMetrics.get(object.metadata?.name);
        const capacity =
          kind === 'cpu'
            ? parseCpuMillis(object.status?.allocatable?.cpu)
            : parseBytes(object.status?.allocatable?.memory);
        const used = usage ? (kind === 'cpu' ? usage.cpuMillis : usage.memoryBytes) : null;
        const percent = used !== null && capacity ? (used / capacity) * 100 : null;
        return (
          <div className="table-meter">
            <Meter value={percent} compact />
            <span className="mono table-meter-label">{percent === null ? '—' : formatPercent(percent)}</span>
          </div>
        );
      },
      sortValue: (object) => {
        const usage = nodeMetrics.get(object.metadata?.name);
        return usage ? (kind === 'cpu' ? usage.cpuMillis : usage.memoryBytes) : 0;
      },
    });
    columns.splice(columns.length - 1, 0, usageColumn('cpu'), usageColumn('memory'));
  }

  if (canQuickEdit) {
    columns.push({
      key: 'quick-actions',
      header: '变更',
      width: '52px',
      align: 'right',
      className: 'actions-cell',
      render: (object) => (
        <QuickActionsMenu
          object={object}
          target={{
            kind: def.kind,
            group: def.group,
            version: def.version,
            plural: def.plural,
            namespace: object.metadata?.namespace,
            name: object.metadata?.name,
          }}
          canPatch
          onChanged={() => {
            query.refetch();
            refreshNow();
          }}
          variant="icon"
        />
      ),
    });
  }

  const empty = (
    <EmptyState
      icon={def.icon}
      title={tr(`还没有 ${def.label}`, `No ${def.label} yet`)}
      description={def.description}
      action={
        canCreate ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> {tr('创建资源')}
          </button>
        ) : undefined
      }
    />
  );

  return (
    <div className="page">
      <PageHeader
        icon={def.icon}
        eyebrow={def.groupName}
        title={def.label}
        description={def.description}
        actions={
          <>
            <span className="refresh-meta">
              {rows.length} {tr('项')}{search ? ` · ${tr('匹配')} ${filtered.length}` : ''}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                query.refetch();
                refreshNow();
              }}
            >
              <RefreshCw size={14} className={query.loading ? 'spin' : ''} /> {tr('刷新')}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setCreateOpen(true)}
              disabled={!canCreate}
            >
              <Plus size={14} /> {tr('创建')}
            </button>
          </>
        }
      />

      <div className="list-toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder={tr(`过滤 ${def.label} 名称…`, `Filter ${def.label} by name…`)}
        />
        <div className="list-toolbar-info">
          <span className="mono muted">
            {def.namespaced
              ? namespace
                ? `ns/${namespace}`
                : tr('全部命名空间')
              : tr('集群级资源')}
          </span>
          {watch.status !== 'off' && (
            <span
              className={`watch-status ${watch.status === 'live' ? 'is-live' : 'is-pending'}`}
              title={
                watch.status === 'live'
                  ? tr('已连接 Kubernetes watch，变更会实时推送。', 'Connected to Kubernetes watch; changes stream in real time.')
                  : tr('正在建立 Kubernetes watch 连接。', 'Establishing the Kubernetes watch connection.')
              }
            >
              <span className="watch-dot" />
              {watch.status === 'live'
                ? tr('实时', 'Live')
                : watch.status === 'reconnecting'
                  ? tr('重连中', 'Reconnecting')
                  : tr('连接中', 'Connecting')}
            </span>
          )}
          {refreshInterval > 0 && watch.status !== 'live' && (
            <span className="muted">
              · {tr('每 {{seconds}}s 自动刷新', 'every {{seconds}}s', { seconds: refreshInterval })}
            </span>
          )}
        </div>
      </div>

      {query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(object) =>
            String(object.metadata?.uid ?? `${object.metadata?.namespace}/${object.metadata?.name}`)
          }
          loading={query.loading}
          empty={empty}
          hasMore={Boolean(continueToken)}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMore()}
          onRowClick={(object) =>
            openResource({
              key: def.key,
              group: def.group,
              version: def.version,
              plural: def.plural,
              kind: def.kind,
              namespace: object.metadata?.namespace,
              name: object.metadata?.name,
              namespaced: def.namespaced,
            })
          }
        />
      )}

      <div className="list-footer">
        <TriangleAlert size={12} />
        <span>
          {tr('查看的是实时集群数据；删除、伸缩等写操作会以当前 kubeconfig 身份直接作用于集群。')}
        </span>
      </div>

      <ApplyYamlModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={tr(`创建 ${def.label}`, `Create ${def.label}`)}
        subtitle={
          namespace
            ? tr(`命名空间 ${namespace}`, `Namespace ${namespace}`)
            : tr('在 YAML 中指定命名空间')
        }
        initialYaml={templates[0].yaml}
        mode="create"
        templates={templates}
        namespace={namespace || 'default'}
        onApplied={() => {
          query.refetch();
          refreshNow();
        }}
      />
    </div>
  );
}

function watchObjectId(object: KubeObject): string {
  return String(object.metadata?.uid ?? `${object.metadata?.namespace}/${object.metadata?.name}`);
}

function parseCpuMillis(value: string | undefined): number {
  if (!value) return 0;
  if (value.endsWith('m')) return Number(value.slice(0, -1));
  if (value.endsWith('n')) return Number(value.slice(0, -1)) / 1e6;
  return Number(value) * 1000;
}

function parseBytes(value: string | undefined): number {
  if (!value) return 0;
  const units: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    K: 1000,
    M: 1e6,
    G: 1e9,
    T: 1e12,
  };
  const match = /^([\d.]+)([A-Za-z]*)$/.exec(value);
  if (!match) return 0;
  return Number(match[1]) * (units[match[2]] ?? 1);
}
