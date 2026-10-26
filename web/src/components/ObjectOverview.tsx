import { KeyRound, LockOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from '../AppContext';
import { useApiQuery } from '../hooks';
import {
  containerResources,
  containerState,
  decodeSecretValue,
  genericStatus,
  nodeReady,
  nodeRoles,
  podReadyCount,
  podStatus,
  selectorOf,
  statusTone,
} from '../lib/kube';
import {
  formatAgeFromTimestamp,
  formatBytes,
  formatCpu,
  formatDateTime,
  truncate,
} from '../lib/format';
import type { KubeObject, MetricsResponse, ResourceRef } from '../types';
import { Badge, Field, KeyValueChips, Ratio } from './ui';
import { Meter, Ring, toneForPercent } from './Gauge';
import { tr } from '../i18n';

export function ObjectOverview({
  object,
  onOpenResource,
  onReveal,
  masked,
}: {
  object: KubeObject;
  onOpenResource?: (ref: ResourceRef) => void;
  onReveal?: () => void;
  masked?: boolean;
}) {
  const { cluster } = useApp();
  const kind = String(object.kind ?? '');
  const namespace = object.metadata?.namespace;
  const isPod = kind === 'Pod';
  const isNode = kind === 'Node';

  const metrics = useApiQuery<MetricsResponse>(
    '/api/metrics',
    { cluster, namespace: isPod ? namespace : undefined, nodesOnly: isNode ? 1 : undefined },
    { enabled: isPod || isNode },
  );

  const podMetric = isPod
    ? metrics.data?.pods.find(
        (item) => item.namespace === namespace && item.name === object.metadata?.name,
      )
    : undefined;
  const nodeMetric = isNode
    ? metrics.data?.nodes.find((item) => item.name === object.metadata?.name)
    : undefined;
  const metricsAvailable = Boolean(metrics.data?.available);

  return (
    <div className="overview-detail">
      <MetadataSection object={object} onOpenResource={onOpenResource} />

      {isPod && (
        <PodSection
          object={object}
          podMetric={podMetric}
          metricsAvailable={metricsAvailable}
          onOpenResource={onOpenResource}
        />
      )}

      {isNode && (
        <NodeSection object={object} nodeMetric={nodeMetric} metricsAvailable={metricsAvailable} />
      )}

      {['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'].includes(kind) && (
        <WorkloadSection object={object} />
      )}
      {kind === 'Service' && <ServiceSection object={object} />}
      {kind === 'Ingress' && <IngressSection object={object} />}
      {kind === 'ConfigMap' && <ConfigMapSection object={object} />}
      {kind === 'Secret' && (
        <SecretSection object={object} masked={Boolean(masked)} onReveal={onReveal} />
      )}
      {isNode && <NodeCapacitySection object={object} />}
      {['PersistentVolumeClaim', 'PersistentVolume', 'StorageClass'].includes(kind) && (
        <StorageSection object={object} />
      )}
      {kind === 'HorizontalPodAutoscaler' && <HpaSection object={object} />}
      {kind === 'CronJob' && <CronJobSection object={object} />}
      {kind === 'Job' && <JobSection object={object} />}
      {kind === 'CustomResourceDefinition' && <CrdSection object={object} />}
      {['Role', 'ClusterRole'].includes(kind) && <RoleSection object={object} />}
      {['RoleBinding', 'ClusterRoleBinding'].includes(kind) && <BindingSection object={object} />}
      {kind === 'ServiceAccount' && <ServiceAccountSection object={object} />}

      {hasContainers(object) && <ContainerSection object={object} />}
      <ConditionsSection object={object} />
      <VolumesSection object={object} />
      <TaintsSection object={object} />
      <LabelsSection object={object} />
    </div>
  );
}

function Section({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="detail-section">
      <div className="detail-section-head">
        <div>
          <h3>{tr(title)}</h3>
          {subtitle && <p>{tr(subtitle)}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function MetadataSection({
  object,
  onOpenResource,
}: {
  object: KubeObject;
  onOpenResource?: (ref: ResourceRef) => void;
}) {
  const meta = object.metadata ?? {};
  const owner = meta.ownerReferences?.[0];
  return (
    <Section title="元数据">
      <div className="detail-grid">
        <Field label="命名空间">{meta.namespace ?? tr('集群级')}</Field>
        <Field label="创建时间">{formatDateTime(meta.creationTimestamp)}</Field>
        <Field label="存活时间">{formatAgeFromTimestamp(meta.creationTimestamp)}</Field>
        <Field label="UID" mono>
          <span title={meta.uid ?? ''}>{truncate(meta.uid, 24)}</span>
        </Field>
        <Field label="资源版本" mono>
          {meta.resourceVersion ?? '—'}
        </Field>
        <Field label="所有者">
          {owner && onOpenResource ? (
            <button
              type="button"
              className="link-button mono"
              onClick={() => {
                const apiVersion = String(owner.apiVersion ?? 'v1');
                const slash = apiVersion.indexOf('/');
                onOpenResource({
                  group: slash === -1 ? '' : apiVersion.slice(0, slash),
                  version: slash === -1 ? apiVersion : apiVersion.slice(slash + 1),
                  plural: `${String(owner.kind).toLowerCase()}s`,
                  kind: owner.kind,
                  namespace: meta.namespace,
                  name: owner.name,
                });
              }}
            >
              {owner.kind}/{owner.name}
            </button>
          ) : (
            '—'
          )}
        </Field>
      </div>
      {Array.isArray(meta.finalizers) && meta.finalizers.length > 0 && (
        <div className="detail-subtle">
          {tr('终结器：')}
          {meta.finalizers.map((value: string) => (
            <code key={value}>{value}</code>
          ))}
        </div>
      )}
    </Section>
  );
}

function PodSection({
  object,
  podMetric,
  metricsAvailable,
  onOpenResource,
}: {
  object: KubeObject;
  podMetric?: { cpuMillis: number; memoryBytes: number };
  metricsAvailable: boolean;
  onOpenResource?: (ref: ResourceRef) => void;
}) {
  const status = podStatus(object);
  const ready = podReadyCount(object);
  const node = object.spec?.nodeName;
  return (
    <Section
      title="Pod 状态"
      actions={
        <Badge tone={statusTone(status.reason)} pulse={status.reason === 'CrashLoopBackOff'}>
          {status.reason}
        </Badge>
      }
    >
      <div className="stat-strip">
        <div className="stat-strip-item">
          <span>{tr('就绪容器')}</span>
          <strong>
            <Ratio ready={ready.ready} total={ready.total} />
          </strong>
        </div>
        <div className="stat-strip-item">
          <span>{tr('重启次数')}</span>
          <strong className={status.restarts > 0 ? 'text-warn' : ''}>{status.restarts}</strong>
        </div>
        <div className="stat-strip-item">
          <span>Pod IP</span>
          <strong className="mono">{object.status?.podIP ?? '—'}</strong>
        </div>
        <div className="stat-strip-item">
          <span>QoS</span>
          <strong className="mono">{object.status?.qosClass ?? '—'}</strong>
        </div>
        <div className="stat-strip-item">
          <span>{tr('CPU / 内存')}</span>
          <strong className="mono">
            {metricsAvailable && podMetric
              ? `${formatCpu(podMetric.cpuMillis)} · ${formatBytes(podMetric.memoryBytes)}`
              : '—'}
          </strong>
        </div>
        <div className="stat-strip-item">
          <span>{tr('节点')}</span>
          <strong>
            {node ? (
              <button
                type="button"
                className="link-button mono"
                onClick={() =>
                  onOpenResource?.({
                    group: '',
                    version: 'v1',
                    plural: 'nodes',
                    kind: 'Node',
                    name: node,
                    namespaced: false,
                  })
                }
              >
                {node}
              </button>
            ) : (
              '—'
            )}
          </strong>
        </div>
      </div>
      <div className="detail-grid detail-grid-tight">
        <Field label="服务账号">{object.spec?.serviceAccountName ?? 'default'}</Field>
        <Field label="重启策略">{object.spec?.restartPolicy ?? 'Always'}</Field>
        <Field label="主机 IP" mono>{object.status?.hostIP ?? '—'}</Field>
        <Field label="优先级类">{object.spec?.priorityClassName ?? '—'}</Field>
        <Field label="运行阶段">{object.status?.phase ?? '—'}</Field>
        <Field label="开始时间">{formatDateTime(object.status?.startTime)}</Field>
      </div>
    </Section>
  );
}

function NodeSection({
  object,
  nodeMetric,
  metricsAvailable,
}: {
  object: KubeObject;
  nodeMetric?: { cpuMillis: number; memoryBytes: number };
  metricsAvailable: boolean;
}) {
  const allocCpu = parseCpuMillis(object.status?.allocatable?.cpu);
  const allocMemory = parseBytes(object.status?.allocatable?.memory);
  const cpuPercent = allocCpu && nodeMetric ? (nodeMetric.cpuMillis / allocCpu) * 100 : null;
  const memoryPercent = allocMemory && nodeMetric ? (nodeMetric.memoryBytes / allocMemory) * 100 : null;

  return (
    <Section
      title="节点状态"
      actions={<Badge tone={nodeReady(object) ? 'ok' : 'err'}>{nodeReady(object) ? 'Ready' : 'NotReady'}</Badge>}
    >
      <div className="node-overview">
        <div className="node-gauges">
          <Ring value={cpuPercent} label="CPU" size={88} />
          <Ring value={memoryPercent} label="内存" size={88} />
        </div>
        <div className="node-facts">
          <Field label="角色">{nodeRoles(object).join(', ')}</Field>
          <Field label="内部 IP" mono>
            {object.status?.addresses?.find((address: KubeObject) => address.type === 'InternalIP')?.address ?? '—'}
          </Field>
          <Field label="Kubelet" mono>{object.status?.nodeInfo?.kubeletVersion ?? '—'}</Field>
          <Field label="操作系统">{object.status?.nodeInfo?.osImage ?? '—'}</Field>
          <Field label="容器运行时" mono>{object.status?.nodeInfo?.containerRuntimeVersion ?? '—'}</Field>
          <Field label="可调度">{object.spec?.unschedulable ? tr('已封锁') : tr('是')}</Field>
        </div>
      </div>
      {!metricsAvailable && (
        <div className="inline-note">
          {tr('metrics-server 不可用，实时使用率无法展示（容量与分配仍可查看）。')}
        </div>
      )}
      {metricsAvailable && nodeMetric && (
        <div className="node-meters">
          <Meter
            label="CPU 已用"
            detail={`${formatCpu(nodeMetric.cpuMillis)} / ${formatCpu(allocCpu)}`}
            value={cpuPercent}
            tone={toneForPercent(cpuPercent)}
          />
          <Meter
            label="内存已用"
            detail={`${formatBytes(nodeMetric.memoryBytes)} / ${formatBytes(allocMemory)}`}
            value={memoryPercent}
            tone={toneForPercent(memoryPercent)}
          />
        </div>
      )}
    </Section>
  );
}

function NodeCapacitySection({ object }: { object: KubeObject }) {
  const capacity = object.status?.capacity ?? {};
  const allocatable = object.status?.allocatable ?? {};
  return (
    <Section title="容量与可分配">
      <table className="simple-table">
        <thead>
          <tr>
            <th>{tr('资源')}</th>
            <th>{tr('容量')}</th>
            <th>{tr('可分配')}</th>
          </tr>
        </thead>
        <tbody>
          {['cpu', 'memory', 'pods', 'ephemeral-storage'].map((key) => (
            <tr key={key}>
              <td className="mono">{key}</td>
              <td className="mono">{formatCapacity(key, capacity[key])}</td>
              <td className="mono">{formatCapacity(key, allocatable[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function WorkloadSection({ object }: { object: KubeObject }) {
  const desired = object.spec?.replicas ?? object.status?.desiredNumberScheduled ?? 0;
  const ready = object.status?.readyReplicas ?? object.status?.numberReady ?? 0;
  return (
    <Section
      title={tr('工作负载', 'Workload')}
      actions={<Badge tone={ready >= desired ? 'ok' : 'warn'}>{ready >= desired ? 'Ready' : 'Degraded'}</Badge>}
    >
      <div className="stat-strip">
        <div className="stat-strip-item">
          <span>{tr('期望副本')}</span>
          <strong>{desired}</strong>
        </div>
        <div className="stat-strip-item">
          <span>{tr('就绪')}</span>
          <strong>{ready}</strong>
        </div>
        <div className="stat-strip-item">
          <span>{tr('已更新')}</span>
          <strong>{object.status?.updatedReplicas ?? object.status?.updatedNumberScheduled ?? 0}</strong>
        </div>
        <div className="stat-strip-item">
          <span>{tr('可用')}</span>
          <strong>{object.status?.availableReplicas ?? object.status?.numberAvailable ?? 0}</strong>
        </div>
        <div className="stat-strip-item">
          <span>{tr('策略')}</span>
          <strong className="mono">
            {object.spec?.strategy?.type ?? object.spec?.updateStrategy?.type ?? '—'}
          </strong>
        </div>
      </div>
      <div className="detail-grid detail-grid-tight">
        <Field label="选择器" mono>{selectorOf(object) || '—'}</Field>
        <Field label="修订版本" mono>
          {object.metadata?.annotations?.['deployment.kubernetes.io/revision'] ?? '—'}
        </Field>
        <Field label="最小就绪" mono>{object.spec?.minReadySeconds ?? 0}s</Field>
        <Field label="修订历史" mono>{object.spec?.revisionHistoryLimit ?? '—'}</Field>
      </div>
    </Section>
  );
}

function ServiceSection({ object }: { object: KubeObject }) {
  const ports: KubeObject[] = object.spec?.ports ?? [];
  return (
    <Section title="服务">
      <div className="detail-grid detail-grid-tight">
        <Field label="类型">{object.spec?.type ?? 'ClusterIP'}</Field>
        <Field label="ClusterIP" mono>{object.spec?.clusterIP ?? '—'}</Field>
        <Field label="外部 IP" mono>{(object.spec?.externalIPs ?? []).join(', ') || '—'}</Field>
        <Field label="会话亲和">{object.spec?.sessionAffinity ?? 'None'}</Field>
        <Field label="选择器" mono>{selectorOf(object) || '—'}</Field>
        <Field label="负载均衡 IP" mono>
          {object.status?.loadBalancer?.ingress?.[0]?.ip ?? object.status?.loadBalancer?.ingress?.[0]?.hostname ?? '—'}
        </Field>
      </div>
      {ports.length > 0 && (
        <table className="simple-table">
          <thead>
            <tr>
              <th>{tr('名称')}</th>
              <th>{tr('端口')}</th>
              <th>{tr('目标端口')}</th>
              <th>NodePort</th>
              <th>{tr('协议')}</th>
            </tr>
          </thead>
          <tbody>
            {ports.map((port, index) => (
              <tr key={index}>
                <td className="mono">{port.name ?? '—'}</td>
                <td className="mono">{port.port}</td>
                <td className="mono">{String(port.targetPort ?? '—')}</td>
                <td className="mono">{port.nodePort ?? '—'}</td>
                <td className="mono">{port.protocol ?? 'TCP'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function IngressSection({ object }: { object: KubeObject }) {
  const rules: KubeObject[] = object.spec?.rules ?? [];
  return (
    <Section title="路由规则">
      <div className="detail-grid detail-grid-tight">
        <Field label="Ingress Class">{object.spec?.ingressClassName ?? '—'}</Field>
        <Field label="负载均衡地址" mono>
          {object.status?.loadBalancer?.ingress
            ?.map((entry: KubeObject) => entry.ip ?? entry.hostname)
            .join(', ') || '—'}
        </Field>
      </div>
      <table className="simple-table">
        <thead>
          <tr>
            <th>Host</th>
            <th>Path</th>
            <th>Path Type</th>
            <th>{tr('后端服务')}</th>
          </tr>
        </thead>
        <tbody>
          {rules.flatMap((rule, ruleIndex) =>
            (rule.http?.paths ?? []).map((path: KubeObject, pathIndex: number) => (
              <tr key={`${ruleIndex}-${pathIndex}`}>
                <td className="mono">{rule.host ?? '*'}</td>
                <td className="mono">{path.path ?? '/'}</td>
                <td>{path.pathType ?? '—'}</td>
                <td className="mono">
                  {path.backend?.service?.name ?? '—'}:
                  {path.backend?.service?.port?.number ?? path.backend?.service?.port?.name ?? '—'}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      {(object.spec?.tls ?? []).length > 0 && (
        <div className="detail-subtle">
          TLS：
          {object.spec.tls
            .map((tls: KubeObject) => `${(tls.hosts ?? []).join(',')} → ${tls.secretName}`)
            .join(' · ')}
        </div>
      )}
    </Section>
  );
}

function ConfigMapSection({ object }: { object: KubeObject }) {
  const entries = Object.entries(object.data ?? {});
  return (
    <Section title={tr('配置项')} subtitle={tr('{{count}} 个键', '{{count}} keys', { count: entries.length })}>
      {entries.length === 0 ? (
        <div className="muted">{tr('没有数据')}</div>
      ) : (
        <div className="kv-list">
          {entries.map(([key, value]) => (
            <div className="kv-row" key={key}>
              <div className="kv-key mono">{key}</div>
              <pre className="kv-value">{truncate(String(value), 800)}</pre>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function SecretSection({
  object,
  masked,
  onReveal,
}: {
  object: KubeObject;
  masked: boolean;
  onReveal?: () => void;
}) {
  const keys: string[] = object._keys ?? Object.keys(object.data ?? {});
  const entries = Object.entries(object.data ?? {});
  return (
    <Section
      title={tr('密钥数据')}
      subtitle={
        masked
          ? tr('内容已脱敏，显示明文需要权限并会记录在审计日志中')
          : tr('明文已显示，请谨慎操作')
      }
      actions={
        masked ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReveal}>
            <LockOpen size={13} /> {tr('显示明文')}
          </button>
        ) : (
          <Badge tone="warn" dot={false}>
            {tr('明文模式')}
          </Badge>
        )
      }
    >
      {masked ? (
        <div className="secret-masked">
          <KeyRound size={16} />
          <div>
            <div>{tr('共 {{count}} 个键', '{{count}} keys', { count: keys.length })}</div>
            <div className="chips" style={{ marginTop: 6 }}>
              {keys.map((key) => (
                <span className="chip" key={key}>
                  {key}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="kv-list">
          {entries.map(([key, value]) => (
            <div className="kv-row" key={key}>
              <div className="kv-key mono">{key}</div>
              <pre className="kv-value">{decodeSecretValue(String(value))}</pre>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function StorageSection({ object }: { object: KubeObject }) {
  if (object.kind === 'StorageClass') {
    return (
      <Section title="存储类">
        <div className="detail-grid detail-grid-tight">
          <Field label="Provisioner" mono>{object.provisioner ?? '—'}</Field>
          <Field label="回收策略">{object.reclaimPolicy ?? '—'}</Field>
          <Field label="绑定模式">{object.volumeBindingMode ?? '—'}</Field>
          <Field label="允许扩容">{object.allowVolumeExpansion ? tr('是') : tr('否')}</Field>
        </div>
        <div className="labels-block" style={{ marginTop: 12 }}>
          <div className="labels-label">{tr('参数')}</div>
          <KeyValueChips values={object.parameters} />
        </div>
      </Section>
    );
  }
  return (
    <Section title="存储">
      <div className="detail-grid detail-grid-tight">
        <Field label="状态">
          <Badge tone={statusTone(object.status?.phase)}>{object.status?.phase ?? '—'}</Badge>
        </Field>
        <Field label="容量" mono>
          {object.status?.capacity?.storage ?? object.spec?.capacity?.storage ?? '—'}
        </Field>
        <Field label="访问模式" mono>{(object.spec?.accessModes ?? []).join(', ') || '—'}</Field>
        <Field label="存储类" mono>{object.spec?.storageClassName ?? '—'}</Field>
        <Field label="绑定卷" mono>{object.spec?.volumeName ?? '—'}</Field>
        <Field label="回收策略">{object.spec?.persistentVolumeReclaimPolicy ?? '—'}</Field>
      </div>
      {object.spec?.claimRef && (
        <div className="detail-subtle">
          {tr('被声明引用：')}
          {object.spec.claimRef.namespace}/{object.spec.claimRef.name}
        </div>
      )}
    </Section>
  );
}

function HpaSection({ object }: { object: KubeObject }) {
  return (
    <Section title="自动扩缩容">
      <div className="stat-strip">
        <div className="stat-strip-item">
          <span>{tr('当前副本')}</span>
          <strong>{object.status?.currentReplicas ?? 0}</strong>
        </div>
        <div className="stat-strip-item">
          <span>{tr('期望副本')}</span>
          <strong>{object.status?.desiredReplicas ?? 0}</strong>
        </div>
        <div className="stat-strip-item">
          <span>{tr('最小 / 最大')}</span>
          <strong>
            {object.spec?.minReplicas ?? 1} / {object.spec?.maxReplicas ?? '—'}
          </strong>
        </div>
        <div className="stat-strip-item">
          <span>{tr('目标')}</span>
          <strong className="mono">
            {object.spec?.scaleTargetRef?.kind}/{object.spec?.scaleTargetRef?.name}
          </strong>
        </div>
      </div>
      <table className="simple-table">
        <thead>
          <tr>
            <th>{tr('指标')}</th>
            <th>{tr('目标')}</th>
            <th>{tr('当前')}</th>
          </tr>
        </thead>
        <tbody>
          {(object.spec?.metrics ?? []).map((metric: KubeObject, index: number) => {
            const current = object.status?.currentMetrics?.[index];
            return (
              <tr key={index}>
                <td>{metric.resource?.name ?? metric.type}</td>
                <td className="mono">
                  {metric.resource?.target?.averageUtilization
                    ? `${metric.resource.target.averageUtilization}%`
                    : metric.resource?.target?.averageValue ?? '—'}
                </td>
                <td className="mono">
                  {current?.resource?.current?.averageUtilization
                    ? `${current.resource.current.averageUtilization}%`
                    : current?.resource?.current?.averageValue ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

function CronJobSection({ object }: { object: KubeObject }) {
  return (
    <Section title="定时任务">
      <div className="detail-grid detail-grid-tight">
        <Field label="调度表达式" mono>{object.spec?.schedule ?? '—'}</Field>
        <Field label="时区">{object.spec?.timeZone ?? '集群默认'}</Field>
        <Field label="挂起">{object.spec?.suspend ? tr('是') : tr('否')}</Field>
        <Field label="并发策略">{object.spec?.concurrencyPolicy ?? 'Allow'}</Field>
        <Field label="上次调度">{formatDateTime(object.status?.lastScheduleTime)}</Field>
        <Field label="活跃 Job">{object.status?.active?.length ?? 0}</Field>
      </div>
    </Section>
  );
}

function JobSection({ object }: { object: KubeObject }) {
  return (
    <Section title="任务">
      <div className="detail-grid detail-grid-tight">
        <Field label="完成数" mono>
          {object.status?.succeeded ?? 0}/{object.spec?.completions ?? 1}
        </Field>
        <Field label="并行度">{object.spec?.parallelism ?? 1}</Field>
        <Field label="重试上限">{object.spec?.backoffLimit ?? 6}</Field>
        <Field label="开始时间">{formatDateTime(object.status?.startTime)}</Field>
        <Field label="完成时间">{formatDateTime(object.status?.completionTime)}</Field>
        <Field label="活跃 Pod">{object.status?.active ?? 0}</Field>
      </div>
    </Section>
  );
}

function CrdSection({ object }: { object: KubeObject }) {
  return (
    <Section title="定义">
      <div className="detail-grid detail-grid-tight">
        <Field label="Group" mono>{object.spec?.group ?? '—'}</Field>
        <Field label="Kind" mono>{object.spec?.names?.kind ?? '—'}</Field>
        <Field label="复数形式" mono>{object.spec?.names?.plural ?? '—'}</Field>
        <Field label="作用域">{object.spec?.scope ?? '—'}</Field>
        <Field label="转换策略">{object.spec?.conversion?.strategy ?? 'None'}</Field>
        <Field label="存储版本" mono>
          {(object.spec?.versions ?? []).find((version: KubeObject) => version.storage)?.name ?? '—'}
        </Field>
      </div>
      <table className="simple-table">
        <thead>
          <tr>
            <th>{tr('版本')}</th>
            <th>Served</th>
            <th>Storage</th>
            <th>Schema</th>
          </tr>
        </thead>
        <tbody>
          {(object.spec?.versions ?? []).map((version: KubeObject) => (
            <tr key={version.name}>
              <td className="mono">{version.name}</td>
              <td>{version.served ? tr('是') : tr('否')}</td>
              <td>{version.storage ? tr('是') : tr('否')}</td>
              <td>{version.schema?.openAPIV3Schema ? 'OpenAPI v3' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function RoleSection({ object }: { object: KubeObject }) {
  const rules: KubeObject[] = object.rules ?? [];
  return (
    <Section title="权限规则">
      <table className="simple-table">
        <thead>
          <tr>
            <th>API Groups</th>
            <th>Resources</th>
            <th>Verbs</th>
            <th>Resource Names</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => (
            <tr key={index}>
              <td className="mono">{(rule.apiGroups ?? ['']).join(', ')}</td>
              <td className="mono">{(rule.resources ?? []).join(', ')}</td>
              <td className="mono">{(rule.verbs ?? []).join(', ')}</td>
              <td className="mono">{(rule.resourceNames ?? []).join(', ') || '—'}</td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                {tr('没有规则')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

function BindingSection({ object }: { object: KubeObject }) {
  return (
    <Section title="绑定关系">
      <div className="detail-grid detail-grid-tight">
        <Field label="角色引用" mono>
          {object.roleRef?.kind}/{object.roleRef?.name}
        </Field>
        <Field label="主体数量">{object.subjects?.length ?? 0}</Field>
      </div>
      <table className="simple-table">
        <thead>
          <tr>
            <th>{tr('类型')}</th>
            <th>{tr('名称')}</th>
            <th>{tr('命名空间')}</th>
          </tr>
        </thead>
        <tbody>
          {(object.subjects ?? []).map((subject: KubeObject, index: number) => (
            <tr key={index}>
              <td>{subject.kind}</td>
              <td className="mono">{subject.name}</td>
              <td className="mono">{subject.namespace ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function ServiceAccountSection({ object }: { object: KubeObject }) {
  return (
    <Section title="服务账号">
      <div className="detail-grid detail-grid-tight">
        <Field label="Secrets 数量">{object.secrets?.length ?? 0}</Field>
        <Field label="镜像拉取密钥">
          {(object.imagePullSecrets ?? []).map((item: KubeObject) => item.name).join(', ') || '—'}
        </Field>
      </div>
    </Section>
  );
}

function ContainerSection({ object }: { object: KubeObject }) {
  const containers: KubeObject[] =
    object.spec?.containers ?? object.spec?.template?.spec?.containers ?? [];
  const initContainers: KubeObject[] =
    object.spec?.initContainers ?? object.spec?.template?.spec?.initContainers ?? [];
  const statuses: KubeObject[] = object.status?.containerStatuses ?? [];
  const all = [...initContainers, ...containers];

  return (
    <Section
      title={tr('容器')}
      subtitle={
        initContainers.length > 0
          ? tr('包含 {{count}} 个初始化容器', '{{count}} init containers', {
              count: initContainers.length,
            })
          : undefined
      }
    >
      <table className="simple-table">
        <thead>
          <tr>
            <th>{tr('名称')}</th>
            <th>{tr('镜像')}</th>
            <th>{tr('状态')}</th>
            <th>{tr('就绪')}</th>
            <th>{tr('重启')}</th>
            <th>{tr('资源请求 / 限制')}</th>
          </tr>
        </thead>
        <tbody>
          {all.map((container) => {
            const status = statuses.find((item) => item.name === container.name);
            const state = containerState(status);
            return (
              <tr key={container.name}>
                <td className="mono">
                  {container.name}
                  {initContainers.includes(container) && <span className="muted"> (init)</span>}
                </td>
                <td className="mono" title={container.image}>
                  {truncate(container.image, 52)}
                </td>
                <td>
                  {status ? <Badge tone={state.tone}>{state.label}</Badge> : <span className="muted">—</span>}
                </td>
                <td>{status ? (status.ready ? tr('是') : tr('否')) : '—'}</td>
                <td className={status?.restartCount > 0 ? 'text-warn mono' : 'mono muted'}>
                  {status?.restartCount ?? 0}
                </td>
                <td className="mono resources-cell">{containerResources(container)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

function ConditionsSection({ object }: { object: KubeObject }) {
  const conditions: KubeObject[] = object.status?.conditions ?? [];
  if (!Array.isArray(conditions) || conditions.length === 0) return null;
  return (
    <Section title="状态条件">
      <table className="simple-table">
        <thead>
          <tr>
            <th>{tr('类型')}</th>
            <th>{tr('状态')}</th>
            <th>{tr('原因')}</th>
            <th>{tr('消息')}</th>
            <th>{tr('更新时间')}</th>
          </tr>
        </thead>
        <tbody>
          {conditions.map((condition, index) => (
            <tr key={`${condition.type}-${index}`}>
              <td className="mono">{condition.type}</td>
              <td>
                <Badge
                  tone={condition.status === 'True' ? 'ok' : condition.status === 'False' ? 'err' : 'warn'}
                >
                  {condition.status}
                </Badge>
              </td>
              <td className="mono">{condition.reason ?? '—'}</td>
              <td className="message-cell">{truncate(condition.message, 160)}</td>
              <td className="mono muted">
                {formatAgeFromTimestamp(condition.lastTransitionTime ?? condition.lastUpdateTime)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function VolumesSection({ object }: { object: KubeObject }) {
  const volumes: KubeObject[] = object.spec?.volumes ?? [];
  if (volumes.length === 0) return null;
  return (
    <Section
      title={tr('卷')}
      subtitle={tr('{{count}} 个', '{{count}} volumes', { count: volumes.length })}
    >
      <div className="volume-list">
        {volumes.map((volume) => {
          const sourceKey = Object.keys(volume).find((key) => key !== 'name');
          const source = sourceKey ? volume[sourceKey] : undefined;
          const summary =
            source?.claimName ??
            source?.name ??
            source?.secretName ??
            source?.configMap?.name ??
            (sourceKey ?? 'emptyDir');
          return (
            <div className="volume-row" key={volume.name}>
              <span className="mono">{volume.name}</span>
              <span className="muted">{sourceKey ?? 'emptyDir'}</span>
              <span className="mono muted">{typeof summary === 'string' ? summary : '—'}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function TaintsSection({ object }: { object: KubeObject }) {
  const taints: KubeObject[] = object.spec?.taints ?? [];
  if (taints.length === 0) return null;
  return (
    <Section title={tr('污点')}>
      <table className="simple-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Value</th>
            <th>Effect</th>
          </tr>
        </thead>
        <tbody>
          {taints.map((taint, index) => (
            <tr key={index}>
              <td className="mono">{taint.key}</td>
              <td className="mono">{taint.value ?? '—'}</td>
              <td>
                <Badge tone="warn">{taint.effect}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function LabelsSection({ object }: { object: KubeObject }) {
  const labels = object.metadata?.labels;
  const annotations = object.metadata?.annotations;
  if (!labels && !annotations) return null;
  return (
    <Section title={tr('标签与注解')}>
      <div className="labels-block">
        <div className="labels-label">Labels</div>
        <KeyValueChips values={labels} limit={16} />
      </div>
      {annotations && (
        <div className="labels-block">
          <div className="labels-label">Annotations</div>
          <KeyValueChips values={annotations} limit={10} />
        </div>
      )}
    </Section>
  );
}

function hasContainers(object: KubeObject): boolean {
  return Boolean(
    object.spec?.containers?.length || object.spec?.template?.spec?.containers?.length,
  );
}

function formatCapacity(key: string, value: string | undefined): string {
  if (!value) return '—';
  if (key === 'cpu') return formatCpu(parseCpuMillis(value));
  if (key === 'memory' || key === 'ephemeral-storage') return formatBytes(parseBytes(value));
  return value;
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

export function resourceStatus(object: KubeObject, kind: string): string {
  if (kind === 'Pod') return podStatus(object).reason;
  if (kind === 'Node') return nodeReady(object) ? 'Ready' : 'NotReady';
  return genericStatus(object);
}
