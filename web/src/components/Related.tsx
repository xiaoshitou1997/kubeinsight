import { Box, ScrollText } from 'lucide-react';
import { useApp } from '../AppContext';
import { ageFromTimestamp, formatAgeFromTimestamp } from '../lib/format';
import { podReadyCount, podStatus, statusTone } from '../lib/kube';
import type { EventsResponse, KubeEvent, KubeObject, ListResponse, ResourceRef } from '../types';
import { useApiQuery } from '../hooks';
import { DataTable, type TableColumn } from './DataTable';
import { Badge, EmptyState, Ratio } from './ui';

const podColumns: Array<TableColumn<KubeObject>> = [
  {
    key: 'name',
    header: 'NAME',
    render: (pod) => <span className="mono name-strong">{pod.metadata?.name}</span>,
    sortValue: (pod) => pod.metadata?.name ?? '',
  },
  {
    key: 'ready',
    header: 'READY',
    width: '70px',
    render: (pod) => {
      const { ready, total } = podReadyCount(pod);
      return <Ratio ready={ready} total={total} />;
    },
  },
  {
    key: 'status',
    header: 'STATUS',
    width: '140px',
    render: (pod) => {
      const status = podStatus(pod);
      return <Badge tone={statusTone(status.reason)}>{status.reason}</Badge>;
    },
  },
  {
    key: 'restarts',
    header: 'RESTARTS',
    width: '80px',
    render: (pod) => <span className="mono muted">{podStatus(pod).restarts}</span>,
  },
  {
    key: 'node',
    header: 'NODE',
    width: '120px',
    render: (pod) => <span className="mono muted">{pod.spec?.nodeName ?? '—'}</span>,
  },
  {
    key: 'age',
    header: 'AGE',
    width: '70px',
    render: (pod) => (
      <span className="mono muted">{formatAgeFromTimestamp(pod.metadata?.creationTimestamp)}</span>
    ),
    sortValue: (pod) => ageFromTimestamp(pod.metadata?.creationTimestamp) ?? 0,
  },
];

export function RelatedPods({
  namespace,
  selector,
  nodeName,
  onOpen,
}: {
  namespace?: string;
  selector?: string;
  nodeName?: string;
  onOpen: (ref: ResourceRef) => void;
}) {
  const { cluster } = useApp();
  const enabled = Boolean(selector || nodeName);
  const query = useApiQuery<ListResponse>(
    '/api/resources',
    {
      cluster,
      group: '',
      version: 'v1',
      plural: 'pods',
      namespace,
      labelSelector: selector || undefined,
      fieldSelector: nodeName ? `spec.nodeName=${nodeName}` : undefined,
      limit: 300,
    },
    { enabled },
  );

  if (!enabled) {
    return (
      <EmptyState
        icon={Box}
        title="无法确定关联的 Pod"
        description="该对象没有可用的 label selector。"
        compact
      />
    );
  }

  const rows = query.data?.items ?? [];

  return (
    <div className="related-pods">
      <div className="related-head">
        <div>
          <h3>关联的 Pods</h3>
          <p className="mono muted">
            {nodeName ? `node=${nodeName}` : selector ? `selector: ${selector}` : ''}
          </p>
        </div>
        <Badge tone="neutral" dot={false}>
          {rows.length}
        </Badge>
      </div>
      <DataTable
        rows={rows}
        columns={podColumns}
        rowKey={(pod) => String(pod.metadata?.uid ?? pod.metadata?.name)}
        loading={query.loading}
        onRowClick={(pod) =>
          onOpen({
            group: '',
            version: 'v1',
            plural: 'pods',
            kind: 'Pod',
            namespace: pod.metadata?.namespace,
            name: pod.metadata?.name,
            namespaced: true,
          })
        }
        empty={<EmptyState icon={Box} title="没有匹配的 Pod" compact />}
      />
    </div>
  );
}

const eventColumns: Array<TableColumn<KubeEvent>> = [
  {
    key: 'type',
    header: 'TYPE',
    width: '90px',
    render: (event) => (
      <Badge tone={event.type === 'Warning' ? 'warn' : 'info'} dot={false}>
        {event.type}
      </Badge>
    ),
  },
  {
    key: 'reason',
    header: 'REASON',
    width: '150px',
    render: (event) => <span className="mono">{event.reason}</span>,
  },
  {
    key: 'message',
    header: 'MESSAGE',
    render: (event) => <span className="message-cell">{event.message}</span>,
  },
  {
    key: 'count',
    header: 'COUNT',
    width: '70px',
    render: (event) => <span className="mono muted">{event.count}</span>,
  },
  {
    key: 'age',
    header: 'LAST SEEN',
    width: '90px',
    render: (event) => <span className="mono muted">{formatAgeFromTimestamp(event.lastSeen)}</span>,
  },
];

export function ObjectEvents({
  namespace,
  kind,
  name,
}: {
  namespace?: string;
  kind: string;
  name: string;
}) {
  const { cluster } = useApp();
  const query = useApiQuery<EventsResponse>(
    '/api/events',
    { cluster, namespace, kind, name, limit: 200 },
    { enabled: Boolean(kind && name) },
  );

  return (
    <div className="object-events">
      <DataTable
        rows={query.data?.items ?? []}
        columns={eventColumns}
        rowKey={(event) => String(event.uid ?? `${event.reason}-${event.lastSeen}-${event.name}`)}
        loading={query.loading}
        empty={
          <EmptyState
            icon={ScrollText}
            title="暂无事件"
            description="Kubernetes 事件默认只保留 1 小时。"
            compact
          />
        }
      />
    </div>
  );
}
