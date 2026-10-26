import {
  Activity,
  ArrowRight,
  Box,
  Boxes,
  CircleAlert,
  Cpu,
  MemoryStick,
  RefreshCw,
  Server,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { useApiQuery, useDocumentTitle } from '../hooks';
import { classNames, formatAge, formatBytes, formatCpu, formatPercent } from '../lib/format';
import { statusTone } from '../lib/kube';
import type { Overview } from '../types';
import { Badge, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { Meter, PhaseDonut, Ring } from '../components/Gauge';
import { resourceForKind } from '../catalog';
import { tr } from '../i18n';

export function OverviewPage() {
  useDocumentTitle(tr('概览'));
  const { cluster, clusterInfo, namespace, setNamespace, openResource, refreshNow, lastRefresh, refreshInterval } =
    useApp();
  const query = useApiQuery<Overview>(
    '/api/overview',
    { cluster, namespace: namespace || undefined },
    { enabled: Boolean(cluster) },
  );
  const data = query.data;

  const openObject = (kind: string | undefined, objectNamespace: string | undefined, name: string) => {
    if (!kind) return;
    const def = resourceForKind(kind);
    if (!def) return;
    openResource({
      key: def.key,
      group: def.group,
      version: def.version,
      plural: def.plural,
      kind: def.kind,
      namespace: def.namespaced ? objectNamespace : undefined,
      name,
      namespaced: def.namespaced,
    });
  };

  if (query.error && !data) {
    return (
      <div className="page">
        <PageHeader title={tr('集群概览')} description={tr('读取集群状态失败')} />
        <ErrorState error={query.error} onRetry={query.refetch} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <PageHeader title={tr('集群概览')} description={tr('正在汇总节点、工作负载与事件…')} />
        <div className="kpi-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="kpi-card" key={index}>
              <Skeleton height={40} />
            </div>
          ))}
        </div>
        <div className="overview-grid">
          <div className="panel panel-skeleton">
            <Skeleton height={240} />
          </div>
          <div className="panel panel-skeleton">
            <Skeleton height={240} />
          </div>
        </div>
      </div>
    );
  }

  const { nodes, pods, workloads, usage, events, problems } = data;
  const metricsAvailable = usage.available;
  const cpuUsed = metricsAvailable ? nodes.cpu.usedPercent : null;
  const memoryUsed = metricsAvailable ? nodes.memory.usedPercent : null;
  const cpuFocus = cpuUsed ?? nodes.cpu.requestedPercent;
  const memoryFocus = memoryUsed ?? nodes.memory.requestedPercent;
  const warningEvents = events.filter((event) => event.type === 'Warning');
  const maxNamespacePods = Math.max(1, ...data.namespaces.items.map((item) => item.pods));
  const degradedDeployments = workloads.deployments.items.filter((item) => item.degraded);
  const otherDegraded = workloads.statefulSets.degraded + workloads.daemonSets.degraded;

  return (
    <div className="page overview-page">
      <PageHeader
        eyebrow="CLUSTER OVERVIEW"
        title={tr('集群概览')}
        description={
          <span className="overview-desc">
            {clusterInfo?.name}
            <span className="dot-sep" />
            {namespace ? (
              <>
                {tr('命名空间')} <code>{namespace}</code>
              </>
            ) : (
              tr('全部命名空间')
            )}
            <span className="dot-sep" />
            <span className="mono">{data.version?.gitVersion ?? '—'}</span>
          </span>
        }
        actions={
          <>
            <span className="refresh-meta">
              {refreshInterval
                ? tr('每 {{seconds}}s 自动刷新', 'Auto-refresh every {{seconds}}s', {
                    seconds: refreshInterval,
                  })
                : tr('手动刷新')}{' '}
              · {tr('更新于')}{' '}
              {formatAge(Math.max(0, Math.round((Date.now() - lastRefresh) / 1000)))}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshNow}>
              <RefreshCw size={14} className={query.loading ? 'spin' : ''} /> {tr('刷新')}
            </button>
          </>
        }
      />

      {data.warnings.length > 0 && (
        <div className="inline-note inline-note-warn">
          <CircleAlert size={14} />
          <span>{data.warnings.join(' · ')}</span>
        </div>
      )}

      <div className="kpi-grid">
        <KpiCard
          icon={Server}
          tone={nodes.ready === nodes.total ? 'ok' : 'warn'}
          label={tr('节点就绪')}
          value={`${nodes.ready}/${nodes.total}`}
          detail={
            nodes.unschedulable > 0
              ? tr('{{count}} 个节点已封锁', '{{count}} node(s) cordoned', {
                  count: nodes.unschedulable,
                })
              : tr('全部节点可调度')
          }
          meter={nodes.total > 0 ? (nodes.ready / nodes.total) * 100 : 0}
        />
        <KpiCard
          icon={Box}
          tone={pods.notReady > 0 || pods.failed > 0 ? 'warn' : 'ok'}
          label={tr('运行中的 Pod')}
          value={String(pods.running)}
          detail={tr(
            `${pods.pending} 等待 · ${pods.failed} 失败 · ${pods.notReady} 未就绪`,
            `${pods.pending} pending · ${pods.failed} failed · ${pods.notReady} not ready`,
          )}
          meter={pods.total > 0 ? (pods.ready / pods.total) * 100 : 0}
        />
        <KpiCard
          icon={Boxes}
          tone={workloads.deployments.degraded + otherDegraded > 0 ? 'warn' : 'ok'}
          label={tr('工作负载就绪')}
          value={`${workloads.deployments.ready}/${workloads.deployments.total}`}
          detail={tr(
            `${workloads.deployments.degraded + otherDegraded} 个未达标 · Deployments`,
            `${workloads.deployments.degraded + otherDegraded} degraded · Deployments`,
          )}
          meter={
            workloads.deployments.total > 0
              ? (workloads.deployments.ready / workloads.deployments.total) * 100
              : 100
          }
        />
        <KpiCard
          icon={TriangleAlert}
          tone={problems.length > 0 || warningEvents.length > 0 ? 'err' : 'ok'}
          label={tr('需要关注')}
          value={String(problems.length + warningEvents.length)}
          detail={tr(
            `${pods.crashLoop} CrashLoop · ${pods.restarts} 次重启`,
            `${pods.crashLoop} CrashLoop · ${pods.restarts} restarts`,
          )}
          meter={Math.min(100, (problems.length + warningEvents.length) * 12)}
          pulse={pods.crashLoop > 0}
        />
      </div>

      <div className="overview-grid overview-grid-primary">
        <section className="panel pressure-panel">
          <PanelHead
            title={tr('资源压力')}
            subtitle={
              metricsAvailable
                ? tr('{{ready}}/{{total}} 个节点上报指标', '{{ready}}/{{total}} nodes reporting', {
                    ready: usage.nodeCount,
                    total: nodes.total,
                  })
                : tr('metrics-server 不可用，展示调度请求量')
            }
            icon={Cpu}
          />
          <div className="pressure-body">
            <div className="pressure-rings">
              <Ring value={cpuFocus} label={metricsAvailable ? 'CPU 已用' : 'CPU 请求'} size={104} stroke={9} />
              <Ring value={memoryFocus} label={metricsAvailable ? '内存已用' : '内存请求'} size={104} stroke={9} />
            </div>
            <div className="pressure-details">
              <div className="pressure-row">
                <span className="pressure-row-label">
                  <Cpu size={14} /> CPU
                </span>
                <div className="pressure-row-values">
                  <strong>{metricsAvailable ? formatCpu(nodes.cpu.usedMillis) : formatCpu(nodes.cpu.requestedMillis)}</strong>
                  <span className="muted">
                    {metricsAvailable
                      ? tr('已用 · 请求 {{value}}', 'used · requests {{value}}', {
                          value: formatCpu(nodes.cpu.requestedMillis),
                        })
                      : tr('请求 · 可分配 {{value}}', 'requests · allocatable {{value}}', {
                          value: formatCpu(nodes.cpu.allocatableMillis),
                        })}
                  </span>
                </div>
              </div>
              <Meter
                value={metricsAvailable ? nodes.cpu.usedPercent : nodes.cpu.requestedPercent}
                label="CPU 使用率"
                detail={formatPercent(metricsAvailable ? nodes.cpu.usedPercent : nodes.cpu.requestedPercent)}
              />
              <div className="pressure-row">
                <span className="pressure-row-label">
                  <MemoryStick size={14} /> {tr('内存')}
                </span>
                <div className="pressure-row-values">
                  <strong>
                    {metricsAvailable ? formatBytes(nodes.memory.usedBytes) : formatBytes(nodes.memory.requestedBytes)}
                  </strong>
                  <span className="muted">
                    {metricsAvailable
                      ? tr('已用 · 请求 {{value}}', 'used · requests {{value}}', {
                          value: formatBytes(nodes.memory.requestedBytes),
                        })
                      : tr('请求 · 可分配 {{value}}', 'requests · allocatable {{value}}', {
                          value: formatBytes(nodes.memory.allocatableBytes),
                        })}
                  </span>
                </div>
              </div>
              <Meter
                value={metricsAvailable ? nodes.memory.usedPercent : nodes.memory.requestedPercent}
                label="内存使用率"
                detail={formatPercent(metricsAvailable ? nodes.memory.usedPercent : nodes.memory.requestedPercent)}
              />
              <div className="pressure-foot">
                <div>
                  <span className="muted">{tr('可分配 CPU')}</span>
                  <strong>{formatCpu(nodes.cpu.allocatableMillis)}</strong>
                </div>
                <div>
                  <span className="muted">{tr('可分配内存')}</span>
                  <strong>{formatBytes(nodes.memory.allocatableBytes)}</strong>
                </div>
                <div>
                  <span className="muted">{tr('命名空间')}</span>
                  <strong>{data.namespaces.total}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel pod-panel">
          <PanelHead
            title={tr('Pod 分布')}
            subtitle={tr(
              `共 ${pods.total} 个${pods.truncated ? '（已截断）' : ''}`,
              `${pods.total} pods${pods.truncated ? ' (truncated)' : ''}`,
            )}
            icon={Activity}
            action={
              <Link className="panel-link" to="/r/pods">
                {tr('全部 Pods')} <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="pod-distribution">
            <PhaseDonut
              segments={[
                { label: 'Running', value: pods.running, color: 'var(--ok)' },
                { label: 'Pending', value: pods.pending, color: 'var(--warn)' },
                { label: 'Succeeded', value: pods.succeeded, color: 'var(--accent-blue)' },
                { label: 'Failed', value: pods.failed, color: 'var(--err)' },
                { label: 'Unknown', value: pods.unknown, color: 'var(--text-dim)' },
              ]}
              centerValue={pods.total}
              centerLabel="PODS"
            />
            <div className="phase-legend">
              <LegendRow color="var(--ok)" label="Running" value={pods.running} />
              <LegendRow color="var(--warn)" label="Pending" value={pods.pending} />
              <LegendRow color="var(--accent-blue)" label="Succeeded" value={pods.succeeded} />
              <LegendRow color="var(--err)" label="Failed" value={pods.failed} />
              <LegendRow color="var(--text-dim)" label="Unknown" value={pods.unknown} />
              <div className="phase-legend-foot">
                <span>
                  {tr('总重启')} <strong className={pods.restarts > 0 ? 'text-warn' : ''}>{pods.restarts}</strong>
                </span>
                <span>
                  CrashLoop <strong className={pods.crashLoop > 0 ? 'text-err' : ''}>{pods.crashLoop}</strong>
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="overview-grid">
        <section className="panel attention-panel">
          <PanelHead
            title={tr('需要关注')}
            subtitle={tr(
              `${problems.length} 个异常 Pod · ${warningEvents.length} 条告警事件`,
              `${problems.length} problem pods · ${warningEvents.length} warning events`,
            )}
            icon={TriangleAlert}
            action={
              <Link className="panel-link" to="/events">
                {tr('事件中心')} <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="attention-list">
            {problems.length === 0 && warningEvents.length === 0 && (
              <div className="all-good">
                <span className="all-good-icon">✓</span>
                <div>
                  <strong>{tr('没有发现异常')}</strong>
                  <p>{tr('所有 Pod 与工作负载处于健康状态。')}</p>
                </div>
              </div>
            )}
            {problems.slice(0, 5).map((problem) => (
              <button
                type="button"
                className="attention-row"
                key={`${problem.namespace}/${problem.name}`}
                onClick={() => openObject('Pod', problem.namespace, problem.name)}
              >
                <span className={classNames('severity-dot', problem.reason === 'CrashLoopBackOff' ? 'is-err' : 'is-warn')} />
                <span className="attention-main">
                  <span className="attention-name">{problem.name}</span>
                  <span className="attention-meta mono">
                    {problem.namespace} · {problem.node ?? tr('未调度')}
                  </span>
                </span>
                <Badge tone={statusTone(problem.reason)}>{problem.reason}</Badge>
                <span className="attention-side">
                  {problem.restarts > 0
                    ? tr('{{count}} 重启', '{{count}} restarts', { count: problem.restarts })
                    : formatAge(problem.ageSeconds)}
                </span>
              </button>
            ))}
            {warningEvents.slice(0, 3).map((event, index) => (
              <button
                type="button"
                className="attention-row attention-event"
                key={`${event.reason}-${index}`}
                onClick={() => openObject(event.kind, event.namespace, event.name)}
              >
                <span className="severity-dot is-err" />
                <span className="attention-main">
                  <span className="attention-name">{event.reason}</span>
                  <span className="attention-meta">{event.message}</span>
                </span>
                <span className="attention-side mono">{event.namespace}</span>
                <span className="attention-side">{formatAge(event.ageSeconds)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel workload-panel">
          <PanelHead
            title={tr('工作负载健康度')}
            subtitle={tr(
              `${workloads.deployments.total} 个 Deployment · ${workloads.statefulSets.total} 个 StatefulSet`,
              `${workloads.deployments.total} Deployments · ${workloads.statefulSets.total} StatefulSets`,
            )}
            icon={Boxes}
            action={
              <Link className="panel-link" to="/r/deployments">
                {tr('全部')} <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="workload-list">
            {degradedDeployments.length === 0 && (
              <div className="all-good compact">
                <span className="all-good-icon">✓</span>
                <div>
                  <strong>{tr('全部 Deployment 已就绪')}</strong>
                  <p>{tr('当前范围内没有未达标的副本。')}</p>
                </div>
              </div>
            )}
            {workloads.deployments.items.slice(0, 8).map((deployment) => {
              const percent = deployment.desired > 0 ? (deployment.ready / deployment.desired) * 100 : 100;
              return (
                <button
                  type="button"
                  className="workload-row"
                  key={`${deployment.namespace}/${deployment.name}`}
                  onClick={() => openObject('Deployment', deployment.namespace, deployment.name)}
                >
                  <span className="workload-main">
                    <span className="workload-name">{deployment.name}</span>
                    <span className="workload-meta mono">{deployment.namespace}</span>
                  </span>
                  <div className="workload-meter">
                    <Meter value={percent} compact tone={deployment.degraded ? 'warn' : 'ok'} />
                  </div>
                  <span className={classNames('workload-ratio mono', deployment.degraded && 'text-warn')}>
                    {deployment.ready}/{deployment.desired}
                  </span>
                  <Badge tone={deployment.degraded ? 'warn' : 'ok'} dot={false}>
                    {deployment.degraded ? 'Degraded' : 'Ready'}
                  </Badge>
                </button>
              );
            })}
          </div>
          <div className="workload-summary">
            <span>
              StatefulSets <strong>{workloads.statefulSets.ready}/{workloads.statefulSets.total}</strong>
            </span>
            <span>
              DaemonSets <strong>{workloads.daemonSets.ready}/{workloads.daemonSets.total}</strong>
            </span>
          </div>
        </section>
      </div>

      <section className="panel nodes-panel">
        <PanelHead
          title={tr('节点')}
          subtitle={tr(
            `${nodes.ready}/${nodes.total} Ready · ${nodes.unschedulable} 封锁`,
            `${nodes.ready}/${nodes.total} Ready · ${nodes.unschedulable} cordoned`,
          )}
          icon={Server}
          action={
            <Link className="panel-link" to="/r/nodes">
              {tr('节点列表')} <ArrowRight size={13} />
            </Link>
          }
        />
        <div className="node-grid">
          {nodes.items.map((node) => (
            <button
              type="button"
              className={classNames('node-card', !node.ready && 'is-down')}
              key={node.name}
              onClick={() =>
                openResource({
                  group: '',
                  version: 'v1',
                  plural: 'nodes',
                  kind: 'Node',
                  name: node.name,
                  namespaced: false,
                  key: 'nodes',
                })
              }
            >
              <div className="node-card-head">
                <span className="node-card-name">{node.name}</span>
                <Badge tone={node.ready ? 'ok' : 'err'}>{node.ready ? 'Ready' : 'NotReady'}</Badge>
              </div>
              <div className="node-card-roles">
                {node.roles.length > 0 ? node.roles.join(' · ') : 'worker'}
                <span className="node-card-version mono">{node.version ?? ''}</span>
              </div>
              <div className="node-card-meters">
                <Meter
                  value={node.cpu.usedPercent ?? node.cpu.requestedPercent}
                  label="CPU"
                  detail={formatPercent(node.cpu.usedPercent ?? node.cpu.requestedPercent)}
                  compact
                />
                <Meter
                  value={node.memory.usedPercent ?? node.memory.requestedPercent}
                  label="MEM"
                  detail={formatPercent(node.memory.usedPercent ?? node.memory.requestedPercent)}
                  compact
                />
              </div>
              <div className="node-card-foot">
                <span>
                  <Box size={12} /> {node.pods}
                  {node.podCapacity ? `/${node.podCapacity}` : ''} pods
                </span>
                <span className="mono">{node.internalIP ?? '—'}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="overview-grid">
        <section className="panel namespace-panel">
          <PanelHead
            title={tr('命名空间分布')}
            subtitle={tr(
              `${data.namespaces.total} 个命名空间`,
              `${data.namespaces.total} namespaces`,
            )}
            icon={Boxes}
            action={
              <Link className="panel-link" to="/r/namespaces">
                {tr('管理')} <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="namespace-bars">
            {data.namespaces.items.slice(0, 8).map((item) => (
              <button
                type="button"
                className={classNames('namespace-bar-row', namespace === item.name && 'is-selected')}
                key={item.name}
                onClick={() => setNamespace(namespace === item.name ? '' : item.name)}
                title={tr('筛选命名空间 {{namespace}}', 'Filter by namespace {{namespace}}', {
                  namespace: item.name,
                })}
              >
                <span className="namespace-name mono">{item.name}</span>
                <span className="namespace-bar">
                  <span style={{ width: `${(item.pods / maxNamespacePods) * 100}%` }} />
                </span>
                <span className="namespace-count mono">{item.pods}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel events-panel">
          <PanelHead
            title={tr('最近告警事件')}
            subtitle={tr(
              `${warningEvents.length} 条 Warning`,
              `${warningEvents.length} warnings`,
            )}
            icon={Activity}
            action={
              <Link className="panel-link" to="/events">
                {tr('全部事件')} <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="event-feed">
            {warningEvents.length === 0 && (
              <div className="muted empty-inline">{tr('当前没有告警事件。')}</div>
            )}
            {warningEvents.slice(0, 6).map((event, index) => (
              <button
                type="button"
                className="event-feed-row"
                key={`${event.reason}-${index}`}
                onClick={() => openObject(event.kind, event.namespace, event.name)}
              >
                <span className="event-feed-time mono">{formatAge(event.ageSeconds)}</span>
                <span className="event-feed-body">
                  <span className="event-feed-reason">
                    {event.reason}
                    {event.count > 1 && <span className="muted"> ×{event.count}</span>}
                  </span>
                  <span className="event-feed-message">{event.message}</span>
                </span>
                <span className="event-feed-object mono">
                  {event.kind}/{event.name}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PanelHead({
  title,
  subtitle,
  icon: Icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="panel-head">
      <div className="panel-title">
        <Icon size={15} />
        <h2>{title}</h2>
        {subtitle && <span className="panel-subtitle">{subtitle}</span>}
      </div>
      {action}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  meter,
  pulse,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: 'ok' | 'warn' | 'err';
  meter: number;
  pulse?: boolean;
}) {
  return (
    <div className={classNames('kpi-card', `kpi-${tone}`)}>
      <div className="kpi-top">
        <span className="kpi-icon">
          <Icon size={17} />
        </span>
        <span className="kpi-label">{label}</span>
        {pulse && <span className="kpi-pulse" />}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-detail">{detail}</div>
      <div className="kpi-meter">
        <span style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
      </div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="legend-row">
      <span className="legend-dot" style={{ background: color }} />
      <span className="legend-label">{label}</span>
      <span className="legend-value mono">{value}</span>
    </div>
  );
}
