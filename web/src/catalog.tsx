import type { LucideIcon } from 'lucide-react';
import {
  Box,
  Boxes,
  Braces,
  ChartColumn,
  Clock,
  Database,
  FileCode,
  FolderTree,
  Gauge,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Link2,
  ListTree,
  Network,
  Package,
  Play,
  Server,
  Shield,
  ShieldCheck,
  Users,
  Waypoints,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { KubeObject } from './types';
import { Badge, Ratio } from './components/ui';
import {
  ageFromTimestamp,
  formatAge,
  formatAgeFromTimestamp,
  truncate,
} from './lib/format';
import {
  imagesOf,
  ingressAddress,
  ingressHosts,
  jobStatus,
  nodeReady,
  nodeRoles,
  ownerOf,
  podReadyCount,
  podStatus,
  pvcCapacity,
  servicePorts,
  statusTone,
  shortImage,
} from './lib/kube';

export interface ColumnDef {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'right';
  render: (object: KubeObject) => ReactNode;
  sortValue?: (object: KubeObject) => string | number;
}

export interface ResourceDef {
  key: string;
  label: string;
  kind: string;
  group: string;
  version: string;
  plural: string;
  namespaced: boolean;
  icon: LucideIcon;
  groupName: string;
  description: string;
  columns: ColumnDef[];
}

const ageColumn: ColumnDef = {
  key: 'age',
  header: 'AGE',
  width: '76px',
  render: (object) => (
    <span className="mono muted" title={object.metadata?.creationTimestamp ?? ''}>
      {formatAgeFromTimestamp(object.metadata?.creationTimestamp)}
    </span>
  ),
  sortValue: (object) => ageFromTimestamp(object.metadata?.creationTimestamp) ?? 0,
};

const readyColumn = (ready: (object: KubeObject) => number, total: (object: KubeObject) => number): ColumnDef => ({
  key: 'ready',
  header: 'READY',
  width: '74px',
  render: (object) => <Ratio ready={ready(object)} total={total(object)} />,
  sortValue: (object) => {
    const desired = total(object);
    return desired === 0 ? 1 : ready(object) / desired;
  },
});

const imagesColumn: ColumnDef = {
  key: 'images',
  header: 'IMAGES',
  render: (object) => {
    const images = imagesOf(object);
    if (images.length === 0) return <span className="muted">—</span>;
    return (
      <span className="image-cell" title={images.join('\n')}>
        {truncate(shortImage(images[0]), 34)}
        {images.length > 1 && <span className="muted"> +{images.length - 1}</span>}
      </span>
    );
  },
  sortValue: (object) => imagesOf(object).join(','),
};

const podColumns: ColumnDef[] = [
  {
    key: 'ready',
    header: 'READY',
    width: '72px',
    render: (object) => {
      const { ready, total } = podReadyCount(object);
      return <Ratio ready={ready} total={total} />;
    },
    sortValue: (object) => {
      const { ready, total } = podReadyCount(object);
      return total === 0 ? 1 : ready / total;
    },
  },
  {
    key: 'status',
    header: 'STATUS',
    width: '150px',
    render: (object) => {
      const status = podStatus(object);
      return (
        <Badge tone={statusTone(status.reason)} pulse={status.reason === 'CrashLoopBackOff'}>
          {status.reason}
        </Badge>
      );
    },
    sortValue: (object) => podStatus(object).reason,
  },
  {
    key: 'restarts',
    header: 'RESTARTS',
    width: '86px',
    render: (object) => {
      const { restarts } = podStatus(object);
      return <span className={restarts > 0 ? 'mono text-warn' : 'mono muted'}>{restarts}</span>;
    },
    sortValue: (object) => podStatus(object).restarts,
  },
  {
    key: 'node',
    header: 'NODE',
    width: '130px',
    render: (object) => (
      <span className="mono muted" title={object.spec?.nodeName ?? ''}>
        {object.spec?.nodeName ?? '—'}
      </span>
    ),
    sortValue: (object) => object.spec?.nodeName ?? '',
  },
  ageColumn,
];

const deploymentColumns: ColumnDef[] = [
  readyColumn(
    (object) => object.status?.readyReplicas ?? 0,
    (object) => object.spec?.replicas ?? 0,
  ),
  {
    key: 'updated',
    header: 'UP-TO-DATE',
    width: '96px',
    render: (object) => <span className="mono muted">{object.status?.updatedReplicas ?? 0}</span>,
    sortValue: (object) => object.status?.updatedReplicas ?? 0,
  },
  {
    key: 'available',
    header: 'AVAILABLE',
    width: '92px',
    render: (object) => <span className="mono muted">{object.status?.availableReplicas ?? 0}</span>,
    sortValue: (object) => object.status?.availableReplicas ?? 0,
  },
  imagesColumn,
  ageColumn,
];

const statefulSetColumns: ColumnDef[] = [
  readyColumn(
    (object) => object.status?.readyReplicas ?? 0,
    (object) => object.spec?.replicas ?? 0,
  ),
  imagesColumn,
  ageColumn,
];

const daemonSetColumns: ColumnDef[] = [
  {
    key: 'desired',
    header: 'DESIRED',
    width: '80px',
    render: (object) => <span className="mono">{object.status?.desiredNumberScheduled ?? 0}</span>,
    sortValue: (object) => object.status?.desiredNumberScheduled ?? 0,
  },
  {
    key: 'ready',
    header: 'READY',
    width: '72px',
    render: (object) => (
      <Ratio
        ready={object.status?.numberReady ?? 0}
        total={object.status?.desiredNumberScheduled ?? 0}
      />
    ),
    sortValue: (object) => object.status?.numberReady ?? 0,
  },
  {
    key: 'updated',
    header: 'UP-TO-DATE',
    width: '96px',
    render: (object) => <span className="mono muted">{object.status?.updatedNumberScheduled ?? 0}</span>,
    sortValue: (object) => object.status?.updatedNumberScheduled ?? 0,
  },
  {
    key: 'available',
    header: 'AVAILABLE',
    width: '92px',
    render: (object) => <span className="mono muted">{object.status?.numberAvailable ?? 0}</span>,
    sortValue: (object) => object.status?.numberAvailable ?? 0,
  },
  ageColumn,
];

const replicaSetColumns: ColumnDef[] = [
  readyColumn(
    (object) => object.status?.readyReplicas ?? 0,
    (object) => object.spec?.replicas ?? 0,
  ),
  {
    key: 'owner',
    header: 'OWNER',
    render: (object) => <span className="mono muted">{ownerOf(object)}</span>,
    sortValue: (object) => ownerOf(object),
  },
  ageColumn,
];

const jobColumns: ColumnDef[] = [
  {
    key: 'completions',
    header: 'COMPLETIONS',
    width: '110px',
    render: (object) => (
      <span className="mono">
        {object.status?.succeeded ?? 0}/{object.spec?.completions ?? 1}
      </span>
    ),
    sortValue: (object) => object.status?.succeeded ?? 0,
  },
  {
    key: 'status',
    header: 'STATUS',
    width: '110px',
    render: (object) => {
      const status = jobStatus(object);
      return <Badge tone={statusTone(status)}>{status}</Badge>;
    },
    sortValue: (object) => jobStatus(object),
  },
  {
    key: 'duration',
    header: 'DURATION',
    width: '90px',
    render: (object) => {
      const start = object.status?.startTime ? Date.parse(object.status.startTime) : null;
      const end = object.status?.completionTime ? Date.parse(object.status.completionTime) : Date.now();
      if (!start) return <span className="muted">—</span>;
      return <span className="mono muted">{formatAge(Math.round((end - start) / 1000))}</span>;
    },
  },
  ageColumn,
];

const cronJobColumns: ColumnDef[] = [
  {
    key: 'schedule',
    header: 'SCHEDULE',
    width: '130px',
    render: (object) => <span className="mono">{object.spec?.schedule ?? '—'}</span>,
    sortValue: (object) => object.spec?.schedule ?? '',
  },
  {
    key: 'suspend',
    header: 'SUSPEND',
    width: '80px',
    render: (object) =>
      object.spec?.suspend ? (
        <Badge tone="warn">Suspended</Badge>
      ) : (
        <span className="muted">False</span>
      ),
    sortValue: (object) => (object.spec?.suspend ? '1' : '0'),
  },
  {
    key: 'active',
    header: 'ACTIVE',
    width: '72px',
    render: (object) => <span className="mono">{object.status?.active?.length ?? 0}</span>,
    sortValue: (object) => object.status?.active?.length ?? 0,
  },
  {
    key: 'lastSchedule',
    header: 'LAST SCHEDULE',
    width: '110px',
    render: (object) => (
      <span className="mono muted">{formatAgeFromTimestamp(object.status?.lastScheduleTime)}</span>
    ),
    sortValue: (object) => ageFromTimestamp(object.status?.lastScheduleTime) ?? 0,
  },
  ageColumn,
];

const serviceColumns: ColumnDef[] = [
  {
    key: 'type',
    header: 'TYPE',
    width: '100px',
    render: (object) => <Badge tone="info">{object.spec?.type ?? 'ClusterIP'}</Badge>,
    sortValue: (object) => object.spec?.type ?? '',
  },
  {
    key: 'clusterIP',
    header: 'CLUSTER-IP',
    width: '130px',
    render: (object) => <span className="mono">{object.spec?.clusterIP ?? '—'}</span>,
    sortValue: (object) => object.spec?.clusterIP ?? '',
  },
  {
    key: 'ports',
    header: 'PORTS',
    render: (object) => <span className="mono">{servicePorts(object) || '—'}</span>,
    sortValue: (object) => servicePorts(object),
  },
  ageColumn,
];

const ingressColumns: ColumnDef[] = [
  {
    key: 'class',
    header: 'CLASS',
    width: '110px',
    render: (object) => <span className="mono muted">{object.spec?.ingressClassName ?? '—'}</span>,
    sortValue: (object) => object.spec?.ingressClassName ?? '',
  },
  {
    key: 'hosts',
    header: 'HOSTS',
    render: (object) => <span className="mono">{ingressHosts(object)}</span>,
    sortValue: (object) => ingressHosts(object),
  },
  {
    key: 'address',
    header: 'ADDRESS',
    width: '150px',
    render: (object) => <span className="mono muted">{ingressAddress(object)}</span>,
    sortValue: (object) => ingressAddress(object),
  },
  ageColumn,
];

const endpointSliceColumns: ColumnDef[] = [
  {
    key: 'type',
    header: 'ADDRESS TYPE',
    width: '120px',
    render: (object) => <span className="mono muted">{object.addressType ?? '—'}</span>,
    sortValue: (object) => object.addressType ?? '',
  },
  {
    key: 'endpoints',
    header: 'ENDPOINTS',
    width: '100px',
    render: (object) => (
      <span className="mono">
        {object.endpoints?.filter((endpoint: KubeObject) => endpoint.conditions?.ready !== false).length ?? 0}
      </span>
    ),
    sortValue: (object) => object.endpoints?.length ?? 0,
  },
  {
    key: 'ports',
    header: 'PORTS',
    render: (object) => (
      <span className="mono muted">
        {(object.ports ?? []).map((port: KubeObject) => `${port.port}/${port.protocol ?? 'TCP'}`).join(', ') || '—'}
      </span>
    ),
  },
  ageColumn,
];

const configMapColumns: ColumnDef[] = [
  {
    key: 'keys',
    header: 'KEYS',
    width: '80px',
    render: (object) => <span className="mono">{Object.keys(object.data ?? {}).length}</span>,
    sortValue: (object) => Object.keys(object.data ?? {}).length,
  },
  ageColumn,
];

const secretColumns: ColumnDef[] = [
  {
    key: 'type',
    header: 'TYPE',
    width: '190px',
    render: (object) => <span className="mono muted">{object.type ?? 'Opaque'}</span>,
    sortValue: (object) => object.type ?? '',
  },
  {
    key: 'keys',
    header: 'KEYS',
    width: '72px',
    render: (object) => (
      <span className="mono">{object._keys?.length ?? Object.keys(object.data ?? {}).length}</span>
    ),
    sortValue: (object) => object._keys?.length ?? 0,
  },
  ageColumn,
];

const hpaColumns: ColumnDef[] = [
  {
    key: 'reference',
    header: 'REFERENCE',
    render: (object) => (
      <span className="mono muted">
        {object.spec?.scaleTargetRef?.kind}/{object.spec?.scaleTargetRef?.name}
      </span>
    ),
    sortValue: (object) => object.spec?.scaleTargetRef?.name ?? '',
  },
  {
    key: 'targets',
    header: 'TARGETS',
    width: '130px',
    render: (object) => {
      const current = object.status?.currentReplicas ?? 0;
      const desired = object.status?.desiredReplicas ?? 0;
      return (
        <span className="mono">
          {current} → {desired}
        </span>
      );
    },
  },
  {
    key: 'range',
    header: 'MIN/MAX',
    width: '90px',
    render: (object) => (
      <span className="mono muted">
        {object.spec?.minReplicas ?? 1}/{object.spec?.maxReplicas ?? '—'}
      </span>
    ),
  },
  ageColumn,
];

const quotaColumns: ColumnDef[] = [
  {
    key: 'resources',
    header: 'RESOURCES',
    width: '100px',
    render: (object) => <span className="mono">{Object.keys(object.spec?.hard ?? {}).length}</span>,
    sortValue: (object) => Object.keys(object.spec?.hard ?? {}).length,
  },
  ageColumn,
];

const limitRangeColumns: ColumnDef[] = [
  {
    key: 'limits',
    header: 'LIMITS',
    width: '90px',
    render: (object) => <span className="mono">{object.spec?.limits?.length ?? 0}</span>,
    sortValue: (object) => object.spec?.limits?.length ?? 0,
  },
  ageColumn,
];

const pdbColumns: ColumnDef[] = [
  {
    key: 'min',
    header: 'MIN AVAILABLE',
    width: '120px',
    render: (object) => <span className="mono">{object.spec?.minAvailable ?? '—'}</span>,
    sortValue: (object) => String(object.spec?.minAvailable ?? ''),
  },
  {
    key: 'max',
    header: 'MAX UNAVAILABLE',
    width: '130px',
    render: (object) => <span className="mono">{object.spec?.maxUnavailable ?? '—'}</span>,
    sortValue: (object) => String(object.spec?.maxUnavailable ?? ''),
  },
  {
    key: 'allowed',
    header: 'ALLOWED DISRUPTIONS',
    width: '150px',
    render: (object) => <span className="mono">{object.status?.disruptionsAllowed ?? 0}</span>,
    sortValue: (object) => object.status?.disruptionsAllowed ?? 0,
  },
  ageColumn,
];

const pvcColumns: ColumnDef[] = [
  {
    key: 'status',
    header: 'STATUS',
    width: '100px',
    render: (object) => (
      <Badge tone={statusTone(object.status?.phase)}>{object.status?.phase ?? 'Unknown'}</Badge>
    ),
    sortValue: (object) => object.status?.phase ?? '',
  },
  {
    key: 'capacity',
    header: 'CAPACITY',
    width: '92px',
    render: (object) => <span className="mono">{pvcCapacity(object)}</span>,
    sortValue: (object) => String(pvcCapacity(object)),
  },
  {
    key: 'access',
    header: 'ACCESS MODES',
    width: '120px',
    render: (object) => (
      <span className="mono muted">{(object.spec?.accessModes ?? []).join(', ') || '—'}</span>
    ),
  },
  {
    key: 'class',
    header: 'STORAGE CLASS',
    width: '140px',
    render: (object) => <span className="mono muted">{object.spec?.storageClassName ?? '—'}</span>,
    sortValue: (object) => object.spec?.storageClassName ?? '',
  },
  ageColumn,
];

const pvColumns: ColumnDef[] = [
  {
    key: 'capacity',
    header: 'CAPACITY',
    width: '90px',
    render: (object) => <span className="mono">{object.spec?.capacity?.storage ?? '—'}</span>,
    sortValue: (object) => String(object.spec?.capacity?.storage ?? ''),
  },
  {
    key: 'access',
    header: 'ACCESS MODES',
    width: '110px',
    render: (object) => (
      <span className="mono muted">{(object.spec?.accessModes ?? []).join(', ') || '—'}</span>
    ),
  },
  {
    key: 'reclaim',
    header: 'RECLAIM POLICY',
    width: '120px',
    render: (object) => <span className="mono muted">{object.spec?.persistentVolumeReclaimPolicy ?? '—'}</span>,
  },
  {
    key: 'status',
    header: 'STATUS',
    width: '90px',
    render: (object) => (
      <Badge tone={statusTone(object.status?.phase)}>{object.status?.phase ?? 'Unknown'}</Badge>
    ),
    sortValue: (object) => object.status?.phase ?? '',
  },
  {
    key: 'claim',
    header: 'CLAIM',
    width: '180px',
    render: (object) => (
      <span className="mono muted">
        {object.spec?.claimRef
          ? `${object.spec.claimRef.namespace}/${object.spec.claimRef.name}`
          : '—'}
      </span>
    ),
  },
  ageColumn,
];

const storageClassColumns: ColumnDef[] = [
  {
    key: 'provisioner',
    header: 'PROVISIONER',
    render: (object) => <span className="mono muted">{object.provisioner ?? '—'}</span>,
    sortValue: (object) => object.provisioner ?? '',
  },
  {
    key: 'reclaim',
    header: 'RECLAIM POLICY',
    width: '130px',
    render: (object) => <span className="mono muted">{object.reclaimPolicy ?? '—'}</span>,
  },
  {
    key: 'binding',
    header: 'VOLUME BINDING',
    width: '130px',
    render: (object) => <span className="mono muted">{object.volumeBindingMode ?? '—'}</span>,
  },
  {
    key: 'default',
    header: 'DEFAULT',
    width: '80px',
    render: (object) =>
      object.metadata?.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true' ? (
        <Badge tone="ok">Default</Badge>
      ) : (
        <span className="muted">—</span>
      ),
  },
  ageColumn,
];

const nodeColumns: ColumnDef[] = [
  {
    key: 'status',
    header: 'STATUS',
    width: '100px',
    render: (object) => {
      const ready = nodeReady(object);
      return <Badge tone={ready ? 'ok' : 'err'}>{ready ? 'Ready' : 'NotReady'}</Badge>;
    },
    sortValue: (object) => (nodeReady(object) ? 1 : 0),
  },
  {
    key: 'roles',
    header: 'ROLES',
    width: '150px',
    render: (object) => (
      <span className="mono muted">{nodeRoles(object).join(', ')}</span>
    ),
    sortValue: (object) => nodeRoles(object).join(','),
  },
  {
    key: 'version',
    header: 'VERSION',
    width: '110px',
    render: (object) => <span className="mono muted">{object.status?.nodeInfo?.kubeletVersion ?? '—'}</span>,
  },
  {
    key: 'pods',
    header: 'POD SLOTS',
    width: '95px',
    render: (object) => (
      <span className="mono muted" title="节点可调度的 Pod 上限">
        {object.status?.capacity?.pods ?? '—'}
      </span>
    ),
  },
  ageColumn,
];

const namespaceColumns: ColumnDef[] = [
  {
    key: 'status',
    header: 'STATUS',
    width: '100px',
    render: (object) => <Badge tone={statusTone(object.status?.phase)}>{object.status?.phase ?? 'Active'}</Badge>,
    sortValue: (object) => object.status?.phase ?? '',
  },
  ageColumn,
];

const crdColumns: ColumnDef[] = [
  {
    key: 'group',
    header: 'GROUP',
    render: (object) => <span className="mono muted">{object.spec?.group ?? '—'}</span>,
    sortValue: (object) => object.spec?.group ?? '',
  },
  {
    key: 'kind',
    header: 'KIND',
    width: '150px',
    render: (object) => <span className="mono">{object.spec?.names?.kind ?? '—'}</span>,
    sortValue: (object) => object.spec?.names?.kind ?? '',
  },
  {
    key: 'scope',
    header: 'SCOPE',
    width: '100px',
    render: (object) => <Badge tone="neutral">{object.spec?.scope ?? '—'}</Badge>,
    sortValue: (object) => object.spec?.scope ?? '',
  },
  {
    key: 'versions',
    header: 'VERSIONS',
    width: '130px',
    render: (object) => (
      <span className="mono muted">
        {(object.spec?.versions ?? []).filter((version: KubeObject) => version.served).map((version: KubeObject) => version.name).join(', ')}
      </span>
    ),
  },
  ageColumn,
];

const serviceAccountColumns: ColumnDef[] = [
  {
    key: 'secrets',
    header: 'SECRETS',
    width: '90px',
    render: (object) => <span className="mono">{object.secrets?.length ?? 0}</span>,
    sortValue: (object) => object.secrets?.length ?? 0,
  },
  ageColumn,
];

const roleColumns: ColumnDef[] = [
  {
    key: 'rules',
    header: 'RULES',
    width: '80px',
    render: (object) => <span className="mono">{object.rules?.length ?? 0}</span>,
    sortValue: (object) => object.rules?.length ?? 0,
  },
  ageColumn,
];

const bindingColumns: ColumnDef[] = [
  {
    key: 'role',
    header: 'ROLE',
    render: (object) => (
      <span className="mono muted">
        {object.roleRef?.kind}/{object.roleRef?.name}
      </span>
    ),
    sortValue: (object) => object.roleRef?.name ?? '',
  },
  {
    key: 'subjects',
    header: 'SUBJECTS',
    width: '90px',
    render: (object) => <span className="mono">{object.subjects?.length ?? 0}</span>,
    sortValue: (object) => object.subjects?.length ?? 0,
  },
  ageColumn,
];

export const RESOURCES: Record<string, ResourceDef> = {
  pods: {
    key: 'pods',
    label: 'Pods',
    kind: 'Pod',
    group: '',
    version: 'v1',
    plural: 'pods',
    namespaced: true,
    icon: Box,
    groupName: '工作负载',
    description: '集群中运行的最小调度单元，查看状态、日志与容器终端。',
    columns: podColumns,
  },
  deployments: {
    key: 'deployments',
    label: 'Deployments',
    kind: 'Deployment',
    group: 'apps',
    version: 'v1',
    plural: 'deployments',
    namespaced: true,
    icon: Boxes,
    groupName: '工作负载',
    description: '声明式管理无状态应用的副本、滚动发布与回滚。',
    columns: deploymentColumns,
  },
  statefulsets: {
    key: 'statefulsets',
    label: 'StatefulSets',
    kind: 'StatefulSet',
    group: 'apps',
    version: 'v1',
    plural: 'statefulsets',
    namespaced: true,
    icon: Database,
    groupName: '工作负载',
    description: '为有状态应用提供稳定的网络标识与持久化存储。',
    columns: statefulSetColumns,
  },
  daemonsets: {
    key: 'daemonsets',
    label: 'DaemonSets',
    kind: 'DaemonSet',
    group: 'apps',
    version: 'v1',
    plural: 'daemonsets',
    namespaced: true,
    icon: Server,
    groupName: '工作负载',
    description: '确保每个（或指定）节点上都运行一个 Pod 副本。',
    columns: daemonSetColumns,
  },
  replicasets: {
    key: 'replicasets',
    label: 'ReplicaSets',
    kind: 'ReplicaSet',
    group: 'apps',
    version: 'v1',
    plural: 'replicasets',
    namespaced: true,
    icon: Layers,
    groupName: '工作负载',
    description: '维护一组同构 Pod 的副本数量，通常由 Deployment 管理。',
    columns: replicaSetColumns,
  },
  jobs: {
    key: 'jobs',
    label: 'Jobs',
    kind: 'Job',
    group: 'batch',
    version: 'v1',
    plural: 'jobs',
    namespaced: true,
    icon: Play,
    groupName: '工作负载',
    description: '运行一次性的批处理任务，直到成功完成指定次数。',
    columns: jobColumns,
  },
  cronjobs: {
    key: 'cronjobs',
    label: 'CronJobs',
    kind: 'CronJob',
    group: 'batch',
    version: 'v1',
    plural: 'cronjobs',
    namespaced: true,
    icon: Clock,
    groupName: '工作负载',
    description: '按 Cron 表达式周期性地创建 Job。',
    columns: cronJobColumns,
  },
  services: {
    key: 'services',
    label: 'Services',
    kind: 'Service',
    group: '',
    version: 'v1',
    plural: 'services',
    namespaced: true,
    icon: Network,
    groupName: '网络',
    description: '为一组 Pod 提供稳定的虚拟 IP 与负载均衡。',
    columns: serviceColumns,
  },
  ingresses: {
    key: 'ingresses',
    label: 'Ingresses',
    kind: 'Ingress',
    group: 'networking.k8s.io',
    version: 'v1',
    plural: 'ingresses',
    namespaced: true,
    icon: Globe,
    groupName: '网络',
    description: '基于主机名与路径将外部流量路由到集群服务。',
    columns: ingressColumns,
  },
  endpointslices: {
    key: 'endpointslices',
    label: 'EndpointSlices',
    kind: 'EndpointSlice',
    group: 'discovery.k8s.io',
    version: 'v1',
    plural: 'endpointslices',
    namespaced: true,
    icon: Waypoints,
    groupName: '网络',
    description: 'Service 背后实际就绪的 Pod 端点。',
    columns: endpointSliceColumns,
  },
  configmaps: {
    key: 'configmaps',
    label: 'ConfigMaps',
    kind: 'ConfigMap',
    group: '',
    version: 'v1',
    plural: 'configmaps',
    namespaced: true,
    icon: FileCode,
    groupName: '配置',
    description: '以键值对形式保存非敏感配置。',
    columns: configMapColumns,
  },
  secrets: {
    key: 'secrets',
    label: 'Secrets',
    kind: 'Secret',
    group: '',
    version: 'v1',
    plural: 'secrets',
    namespaced: true,
    icon: KeyRound,
    groupName: '配置',
    description: '保存密码、令牌与证书等敏感数据，默认脱敏展示。',
    columns: secretColumns,
  },
  hpa: {
    key: 'hpa',
    label: 'HorizontalPodAutoscalers',
    kind: 'HorizontalPodAutoscaler',
    group: 'autoscaling',
    version: 'v2',
    plural: 'horizontalpodautoscalers',
    namespaced: true,
    icon: Gauge,
    groupName: '配置',
    description: '根据 CPU、内存或自定义指标自动扩缩容工作负载。',
    columns: hpaColumns,
  },
  resourcequotas: {
    key: 'resourcequotas',
    label: 'ResourceQuotas',
    kind: 'ResourceQuota',
    group: '',
    version: 'v1',
    plural: 'resourcequotas',
    namespaced: true,
    icon: ChartColumn,
    groupName: '配置',
    description: '限制命名空间内的资源总量与对象数量。',
    columns: quotaColumns,
  },
  limitranges: {
    key: 'limitranges',
    label: 'LimitRanges',
    kind: 'LimitRange',
    group: '',
    version: 'v1',
    plural: 'limitranges',
    namespaced: true,
    icon: ListTree,
    groupName: '配置',
    description: '为命名空间内的容器设置默认与最大资源限制。',
    columns: limitRangeColumns,
  },
  pdb: {
    key: 'pdb',
    label: 'PodDisruptionBudgets',
    kind: 'PodDisruptionBudget',
    group: 'policy',
    version: 'v1',
    plural: 'poddisruptionbudgets',
    namespaced: true,
    icon: Shield,
    groupName: '配置',
    description: '在自愿中断（如节点维护）期间保证最小可用副本数。',
    columns: pdbColumns,
  },
  pvcs: {
    key: 'pvcs',
    label: 'PersistentVolumeClaims',
    kind: 'PersistentVolumeClaim',
    group: '',
    version: 'v1',
    plural: 'persistentvolumeclaims',
    namespaced: true,
    icon: HardDrive,
    groupName: '存储',
    description: '应用对持久化存储的请求，绑定后可供 Pod 挂载。',
    columns: pvcColumns,
  },
  pvs: {
    key: 'pvs',
    label: 'PersistentVolumes',
    kind: 'PersistentVolume',
    group: '',
    version: 'v1',
    plural: 'persistentvolumes',
    namespaced: false,
    icon: Database,
    groupName: '存储',
    description: '集群级别的存储资源，独立于任何命名空间。',
    columns: pvColumns,
  },
  storageclasses: {
    key: 'storageclasses',
    label: 'StorageClasses',
    kind: 'StorageClass',
    group: 'storage.k8s.io',
    version: 'v1',
    plural: 'storageclasses',
    namespaced: false,
    icon: Package,
    groupName: '存储',
    description: '定义存储的供给方式、回收策略与绑定模式。',
    columns: storageClassColumns,
  },
  nodes: {
    key: 'nodes',
    label: 'Nodes',
    kind: 'Node',
    group: '',
    version: 'v1',
    plural: 'nodes',
    namespaced: false,
    icon: Server,
    groupName: '集群',
    description: '集群的工作节点，查看资源压力、污点与调度状态。',
    columns: nodeColumns,
  },
  namespaces: {
    key: 'namespaces',
    label: 'Namespaces',
    kind: 'Namespace',
    group: '',
    version: 'v1',
    plural: 'namespaces',
    namespaced: false,
    icon: FolderTree,
    groupName: '集群',
    description: '集群资源的逻辑隔离单元。',
    columns: namespaceColumns,
  },
  crds: {
    key: 'crds',
    label: 'CustomResourceDefinitions',
    kind: 'CustomResourceDefinition',
    group: 'apiextensions.k8s.io',
    version: 'v1',
    plural: 'customresourcedefinitions',
    namespaced: false,
    icon: Braces,
    groupName: '集群',
    description: '扩展 Kubernetes API 的自定义资源定义。',
    columns: crdColumns,
  },
  serviceaccounts: {
    key: 'serviceaccounts',
    label: 'ServiceAccounts',
    kind: 'ServiceAccount',
    group: '',
    version: 'v1',
    plural: 'serviceaccounts',
    namespaced: true,
    icon: Users,
    groupName: '访问控制',
    description: '为 Pod 提供访问 API Server 的身份。',
    columns: serviceAccountColumns,
  },
  roles: {
    key: 'roles',
    label: 'Roles',
    kind: 'Role',
    group: 'rbac.authorization.k8s.io',
    version: 'v1',
    plural: 'roles',
    namespaced: true,
    icon: Shield,
    groupName: '访问控制',
    description: '命名空间级别的权限规则集合。',
    columns: roleColumns,
  },
  rolebindings: {
    key: 'rolebindings',
    label: 'RoleBindings',
    kind: 'RoleBinding',
    group: 'rbac.authorization.k8s.io',
    version: 'v1',
    plural: 'rolebindings',
    namespaced: true,
    icon: Link2,
    groupName: '访问控制',
    description: '将 Role 绑定到用户、组或 ServiceAccount。',
    columns: bindingColumns,
  },
  clusterroles: {
    key: 'clusterroles',
    label: 'ClusterRoles',
    kind: 'ClusterRole',
    group: 'rbac.authorization.k8s.io',
    version: 'v1',
    plural: 'clusterroles',
    namespaced: false,
    icon: ShieldCheck,
    groupName: '访问控制',
    description: '集群级别的权限规则集合。',
    columns: roleColumns,
  },
  clusterrolebindings: {
    key: 'clusterrolebindings',
    label: 'ClusterRoleBindings',
    kind: 'ClusterRoleBinding',
    group: 'rbac.authorization.k8s.io',
    version: 'v1',
    plural: 'clusterrolebindings',
    namespaced: false,
    icon: Link2,
    groupName: '访问控制',
    description: '在集群范围内授予 ClusterRole 权限。',
    columns: bindingColumns,
  },
};

export const NAV_GROUPS: Array<{ label: string; keys: string[] }> = [
  { label: '工作负载', keys: ['pods', 'deployments', 'statefulsets', 'daemonsets', 'replicasets', 'jobs', 'cronjobs'] },
  { label: '网络', keys: ['services', 'ingresses', 'endpointslices'] },
  { label: '配置', keys: ['configmaps', 'secrets', 'hpa', 'resourcequotas', 'limitranges', 'pdb'] },
  { label: '存储', keys: ['pvcs', 'pvs', 'storageclasses'] },
  { label: '集群', keys: ['nodes', 'namespaces', 'crds'] },
  { label: '访问控制', keys: ['serviceaccounts', 'roles', 'rolebindings', 'clusterroles', 'clusterrolebindings'] },
];

export function resourceForKind(kind: string, group?: string): ResourceDef | undefined {
  return Object.values(RESOURCES).find(
    (resource) => resource.kind === kind && (!group || resource.group === group),
  ) ?? Object.values(RESOURCES).find((resource) => resource.kind === kind);
}

export function resourceTemplates(namespace: string): Array<{ label: string; yaml: string }> {
  return [
    {
      label: 'Deployment + Service',
      yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: ${namespace}
  labels:
    app: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
---
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: ${namespace}
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
`,
    },
    {
      label: 'ConfigMap',
      yaml: `apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: ${namespace}
data:
  LOG_LEVEL: info
  APP_MODE: production
`,
    },
    {
      label: 'Secret',
      yaml: `apiVersion: v1
kind: Secret
metadata:
  name: app-secret
  namespace: ${namespace}
type: Opaque
stringData:
  username: demo
  password: change-me
`,
    },
    {
      label: 'CronJob',
      yaml: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: hello
  namespace: ${namespace}
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: hello
              image: busybox:1.36
              command: ["/bin/sh", "-c", "date; echo hello from kubeinsight"]
`,
    },
    {
      label: 'Ingress',
      yaml: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: ${namespace}
spec:
  ingressClassName: nginx
  rules:
    - host: web.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
`,
    },
  ];
}

export function columnValue(object: KubeObject, column: ColumnDef): string | number {
  if (column.sortValue) return column.sortValue(object);
  const value = object[column.key];
  if (value === undefined || value === null) return '';
  return typeof value === 'number' ? value : String(value);
}

export function containerSummary(object: KubeObject): string {
  return (object.spec?.template?.spec?.containers ?? object.spec?.containers ?? [])
    .map((container: KubeObject) => container.name)
    .join(', ');
}
