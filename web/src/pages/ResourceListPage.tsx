import { Plus, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../AppContext';
import { RESOURCES, resourceTemplates } from '../catalog';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Meter } from '../components/Gauge';
import { ApplyYamlModal } from '../components/YamlEditor';
import { EmptyState, ErrorState, PageHeader, SearchBox } from '../components/ui';
import { useApiQuery, useDocumentTitle } from '../hooks';
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

  useDocumentTitle(def?.label ?? '资源');

  const query = useApiQuery<ListResponse>(
    '/api/resources',
    {
      cluster,
      group: def?.group,
      version: def?.version,
      plural: def?.plural,
      namespace: def?.namespaced ? namespace || undefined : undefined,
      limit: 250,
    },
    { enabled: Boolean(def) },
  );

  const metrics = useApiQuery<MetricsResponse>(
    '/api/metrics',
    { cluster, nodesOnly: key === 'nodes' ? 1 : undefined },
    { enabled: key === 'nodes' },
  );

  const resourceVersion = query.data?.resourceVersion;
  useEffect(() => {
    setExtraItems([]);
    setContinueToken(query.data?.continue ?? null);
  }, [resourceVersion, query.data?.continue, key, namespace]);

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

  const empty = (
    <EmptyState
      icon={def.icon}
      title={`还没有 ${def.label}`}
      description={def.description}
      action={
        canCreate ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> 创建资源
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
              {rows.length} 项{search ? ` · 匹配 ${filtered.length}` : ''}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshNow}>
              <RefreshCw size={14} className={query.loading ? 'spin' : ''} /> 刷新
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setCreateOpen(true)}
              disabled={!canCreate}
            >
              <Plus size={14} /> 创建
            </button>
          </>
        }
      />

      <div className="list-toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder={`过滤 ${def.label} 名称…`} />
        <div className="list-toolbar-info">
          <span className="mono muted">
            {def.namespaced ? (namespace ? `ns/${namespace}` : '全部命名空间') : '集群级资源'}
          </span>
          {refreshInterval > 0 && <span className="muted">· 每 {refreshInterval}s 自动刷新</span>}
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
        <span>查看的是实时集群数据；删除、伸缩等写操作会以当前 kubeconfig 身份直接作用于集群。</span>
      </div>

      <ApplyYamlModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={`创建 ${def.label}`}
        subtitle={namespace ? `命名空间 ${namespace}` : '在 YAML 中指定命名空间'}
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
