import { Braces, ChevronRight, RefreshCw, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Badge, EmptyState, ErrorState, PageHeader, SearchBox } from '../components/ui';
import { useApiQuery, useDocumentTitle } from '../hooks';
import { tr } from '../i18n';
import { ageFromTimestamp, formatAgeFromTimestamp } from '../lib/format';
import type { ApiResourceInfo, KubeObject, ListResponse } from '../types';

interface DiscoveryResponse {
  cluster: string;
  resources: ApiResourceInfo[];
  warnings: string[];
}

export function ApiExplorerPage() {
  useDocumentTitle('API Explorer');
  const { cluster, namespace, openResource } = useApp();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ApiResourceInfo | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const discovery = useApiQuery<DiscoveryResponse>(
    '/api/discovery',
    { cluster, refresh: refreshToken || undefined },
    { enabled: Boolean(cluster) },
  );

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const resources = (discovery.data?.resources ?? []).filter((resource) => {
      if (!needle) return true;
      return `${resource.kind} ${resource.plural} ${resource.group} ${resource.shortNames.join(' ')}`
        .toLowerCase()
        .includes(needle);
    });
    const map = new Map<string, ApiResourceInfo[]>();
    for (const resource of resources) {
      const list = map.get(resource.group) ?? [];
      list.push(resource);
      map.set(resource.group, list);
    }
    return [...map.entries()]
      .map(([group, list]) => ({
        group,
        label: group || 'core',
        resources: list.sort((a, b) => a.kind.localeCompare(b.kind)),
      }))
      .sort((a, b) => (a.group === '' ? -1 : b.group === '' ? 1 : a.group.localeCompare(b.group)));
  }, [discovery.data, search]);

  const instances = useApiQuery<ListResponse>(
    '/api/resources',
    {
      cluster,
      group: selected?.group,
      version: selected?.version,
      plural: selected?.plural,
      namespace: selected?.namespaced ? namespace || undefined : undefined,
      limit: 200,
    },
    { enabled: Boolean(selected) },
  );

  const openObject = (object: KubeObject) => {
    if (!selected) return;
    openResource({
      group: selected.group,
      version: selected.version,
      plural: selected.plural,
      kind: selected.kind,
      namespace: object.metadata?.namespace,
      name: object.metadata?.name,
      namespaced: selected.namespaced,
    });
  };

  const columns: Array<TableColumn<KubeObject>> = [
    {
      key: 'name',
      header: 'NAME',
      render: (object) => <span className="name-link">{object.metadata?.name}</span>,
      sortValue: (object) => object.metadata?.name ?? '',
    },
    ...(selected?.namespaced && !namespace
      ? [
          {
            key: 'namespace',
            header: 'NAMESPACE',
            width: '180px',
            render: (object: KubeObject) => (
              <span className="mono muted">{object.metadata?.namespace ?? '—'}</span>
            ),
          } as TableColumn<KubeObject>,
        ]
      : []),
    {
      key: 'age',
      header: 'AGE',
      width: '90px',
      render: (object) => (
        <span className="mono muted">{formatAgeFromTimestamp(object.metadata?.creationTimestamp)}</span>
      ),
      sortValue: (object) => ageFromTimestamp(object.metadata?.creationTimestamp) ?? 0,
    },
    ...(selected?.group === 'apiextensions.k8s.io' && selected.kind === 'CustomResourceDefinition'
      ? []
      : []),
  ];

  return (
    <div className="page explorer-page">
      <PageHeader
        icon={Braces}
        eyebrow="DISCOVERY"
        title="API Explorer"
        description={tr('直接浏览集群发现的所有 API 资源，包括 CRD 与聚合 API；适用于排查自定义资源。')}
        actions={
          <>
            <span className="refresh-meta">
              {discovery.data?.resources.length ?? 0} {tr('个资源类型')}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setRefreshToken((value) => value + 1);
                discovery.refetch();
              }}
            >
              <RefreshCw size={14} className={discovery.loading ? 'spin' : ''} /> {tr('重新发现')}
            </button>
          </>
        }
      />

      {discovery.data?.warnings && discovery.data.warnings.length > 0 && (
        <div className="inline-note inline-note-warn">{discovery.data.warnings.join(' · ')}</div>
      )}

      {discovery.error && !discovery.data ? (
        <ErrorState error={discovery.error} onRetry={discovery.refetch} />
      ) : (
        <div className="explorer-layout">
          <aside className="panel explorer-sidebar">
            <div className="explorer-search">
              <SearchBox value={search} onChange={setSearch} placeholder={tr('搜索 Kind、资源名或 API 组…')} />
            </div>
            <div className="explorer-scroll">
              {groups.length === 0 && (
                <div className="explorer-empty">{tr('没有匹配的 API 资源')}</div>
              )}
              {groups.map((group) => (
                <div className="explorer-group" key={group.label}>
                  <div className="explorer-group-label">{group.label}</div>
                  {group.resources.map((resource) => (
                    <button
                      type="button"
                      key={`${resource.group}/${resource.version}/${resource.plural}`}
                      className={`explorer-item ${
                        selected?.plural === resource.plural &&
                        selected.group === resource.group &&
                        selected.version === resource.version
                          ? 'is-active'
                          : ''
                      }`}
                      onClick={() => setSelected(resource)}
                    >
                      <span className="explorer-item-main">
                        <span className="explorer-kind">{resource.kind}</span>
                        <span className="explorer-plural mono">{resource.plural}</span>
                      </span>
                      <span className="explorer-item-side">
                        {resource.namespaced ? 'NS' : 'CL'}
                        <ChevronRight size={12} />
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </aside>

          <section className="panel explorer-main">
            {!selected ? (
              <EmptyState
                icon={Braces}
                title={tr('选择一个 API 资源')}
                description={tr('左侧列出了集群发现的全部资源类型。选择后可浏览实例并打开详情。')}
              />
            ) : (
              <>
                <div className="explorer-detail-head">
                  <div>
                    <div className="eyebrow mono">
                      {selected.group || 'core'}/{selected.version}
                    </div>
                    <h2>{selected.kind}</h2>
                    <div className="explorer-detail-sub">
                      <span className="mono">{selected.plural}</span>
                      <span className="dot-sep" />
                      <Badge tone={selected.namespaced ? 'info' : 'neutral'} dot={false}>
                        {selected.namespaced ? 'Namespaced' : 'Cluster-scoped'}
                      </Badge>
                      {selected.shortNames.length > 0 && (
                        <>
                          <span className="dot-sep" />
                          <span className="muted mono">
                            {tr('短名')} {selected.shortNames.join(', ')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="explorer-verbs">
                    {selected.verbs.map((verb) => (
                      <span className="verb-chip" key={verb}>
                        {verb}
                      </span>
                    ))}
                  </div>
                </div>

                <DataTable
                  rows={instances.data?.items ?? []}
                  columns={columns}
                  rowKey={(object) =>
                    String(object.metadata?.uid ?? `${object.metadata?.namespace}/${object.metadata?.name}`)
                  }
                  loading={instances.loading}
                  onRowClick={openObject}
                  empty={
                    <EmptyState
                      icon={SearchX}
                      title={tr('没有找到实例')}
                      description={
                        selected.namespaced && !namespace
                          ? tr('当前视图为全部命名空间。')
                          : tr('该资源类型下暂无对象。')
                      }
                      compact
                    />
                  }
                />
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
