import { queryString, type Handler } from '../http/context.js';
import { ageSeconds, eventTimestamp, podStatus } from '../k8s/sanitize.js';
import { fetchNodeMetrics } from '../k8s/metrics.js';
import { parseBytes, parseCpuMillis, percent } from '../util/quantity.js';
import { target } from './shared.js';
import type { KubeClient } from '../k8s/client.js';

type Obj = Record<string, any>;

interface KubeList {
  items?: Obj[];
}

interface Settled<T> {
  data?: T;
  error?: string;
}

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { data: await promise };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

async function list(
  client: KubeClient,
  path: string,
  namespace?: string,
  query: Record<string, string | number> = {},
): Promise<Obj[]> {
  const fullPath = namespace ? path.replace('/{ns}', `/namespaces/${encodeURIComponent(namespace)}`) : path.replace('/{ns}', '');
  const result = await client.request<KubeList>(fullPath, {
    query,
    timeoutMs: 45_000,
  });
  return result.items ?? [];
}

function podRequests(pod: Obj): { cpuMillis: number; memoryBytes: number } {
  let cpuMillis = 0;
  let memoryBytes = 0;
  for (const container of pod.spec?.containers ?? []) {
    cpuMillis += parseCpuMillis(container.resources?.requests?.cpu) ?? 0;
    memoryBytes += parseBytes(container.resources?.requests?.memory) ?? 0;
  }
  let initCpu = 0;
  let initMemory = 0;
  for (const container of pod.spec?.initContainers ?? []) {
    initCpu = Math.max(initCpu, parseCpuMillis(container.resources?.requests?.cpu) ?? 0);
    initMemory = Math.max(initMemory, parseBytes(container.resources?.requests?.memory) ?? 0);
  }
  return { cpuMillis: cpuMillis + initCpu, memoryBytes: memoryBytes + initMemory };
}

export const overviewHandler: Handler = async (ctx) => {
  const t = target(ctx);
  const namespace = queryString(ctx, 'namespace');

  const [nodes, namespaces, pods, deployments, statefulSets, daemonSets, events, nodeMetrics] =
    await Promise.all([
      settle(list(t.client, '/api/v1/nodes', undefined, { limit: 1000 })),
      settle(list(t.client, '/api/v1/namespaces', undefined, { limit: 1000 })),
      settle(list(t.client, '/api/v1/pods/{ns}', namespace, { limit: 3000 })),
      settle(list(t.client, '/apis/apps/v1/deployments/{ns}', namespace, { limit: 1000 })),
      settle(list(t.client, '/apis/apps/v1/statefulsets/{ns}', namespace, { limit: 1000 })),
      settle(list(t.client, '/apis/apps/v1/daemonsets/{ns}', namespace, { limit: 1000 })),
      settle(
        list(t.client, '/api/v1/events/{ns}', namespace, {
          limit: 300,
          fieldSelector: 'type=Warning',
        }),
      ),
      settle(fetchNodeMetrics(t.client)),
    ]);

  const warnings: string[] = [];
  if (nodes.error) warnings.push(`Nodes: ${nodes.error}`);
  if (pods.error) warnings.push(`Pods: ${pods.error}`);
  if (deployments.error) warnings.push(`Deployments: ${deployments.error}`);
  if (events.error) warnings.push(`Events: ${events.error}`);
  if (nodeMetrics.error) warnings.push(`Metrics: ${nodeMetrics.error}`);
  if (nodeMetrics.data === null) warnings.push('metrics-server is not available; live usage is hidden.');

  const podItems = pods.data ?? [];
  const nodeItems = nodes.data ?? [];
  const deploymentItems = deployments.data ?? [];
  const namespaceItems = namespaces.data ?? [];
  const statefulItems = statefulSets.data ?? [];
  const daemonItems = daemonSets.data ?? [];

  const usageByNode = new Map((nodeMetrics.data ?? []).map((m) => [m.name, m]));
  const podsByNode = new Map<string, number>();
  const podsByNamespace = new Map<string, number>();
  const requestsByNode = new Map<string, { cpuMillis: number; memoryBytes: number }>();

  let restarts = 0;
  let readyPods = 0;
  let notReady = 0;
  let crashLoop = 0;
  let terminating = 0;
  const byPhase: Record<string, number> = {};
  const problems: Array<Record<string, any>> = [];

  for (const pod of podItems) {
    const status = podStatus(pod);
    restarts += status.restarts;
    byPhase[status.phase] = (byPhase[status.phase] ?? 0) + 1;
    if (status.ready) readyPods += 1;
    if (status.phase === 'Running' && !status.ready) notReady += 1;
    if (status.reason === 'CrashLoopBackOff') crashLoop += 1;
    if (status.reason === 'Terminating') terminating += 1;

    const nodeName = pod.spec?.nodeName;
    if (nodeName) {
      podsByNode.set(nodeName, (podsByNode.get(nodeName) ?? 0) + 1);
      if (status.phase !== 'Succeeded' && status.phase !== 'Failed') {
        const requests = podRequests(pod);
        const current = requestsByNode.get(nodeName) ?? { cpuMillis: 0, memoryBytes: 0 };
        current.cpuMillis += requests.cpuMillis;
        current.memoryBytes += requests.memoryBytes;
        requestsByNode.set(nodeName, current);
      }
    }
    const podNamespace = pod.metadata?.namespace ?? '';
    if (podNamespace) podsByNamespace.set(podNamespace, (podsByNamespace.get(podNamespace) ?? 0) + 1);

    const bad =
      (status.phase !== 'Running' && status.phase !== 'Succeeded') ||
      (status.phase === 'Running' && !status.ready) ||
      status.reason === 'CrashLoopBackOff' ||
      status.reason === 'ImagePullBackOff' ||
      status.reason === 'ErrImagePull' ||
      status.restarts >= 5;
    if (bad) {
      problems.push({
        kind: 'Pod',
        namespace: podNamespace,
        name: pod.metadata?.name ?? '',
        reason: status.reason,
        phase: status.phase,
        ready: status.ready,
        restarts: status.restarts,
        ageSeconds: ageSeconds(pod.metadata?.creationTimestamp),
        node: nodeName ?? null,
      });
    }
  }

  problems.sort((a, b) => {
    const severity = (item: Record<string, any>) =>
      item.reason === 'CrashLoopBackOff' ? 3 : item.phase === 'Pending' ? 2 : item.phase === 'Failed' ? 2 : 1;
    return severity(b) - severity(a) || (b.restarts ?? 0) - (a.restarts ?? 0);
  });

  const nodeView = nodeItems.map((node) => {
    const allocCpu = parseCpuMillis(node.status?.allocatable?.cpu) ?? 0;
    const allocMemory = parseBytes(node.status?.allocatable?.memory) ?? 0;
    const requests = requestsByNode.get(node.metadata?.name) ?? { cpuMillis: 0, memoryBytes: 0 };
    const usage = usageByNode.get(node.metadata?.name);
    const readyCondition = (node.status?.conditions ?? []).find((c: Obj) => c.type === 'Ready');
    const roles = Object.keys(node.metadata?.labels ?? {})
      .filter((key) => key.startsWith('node-role.kubernetes.io/'))
      .map((key) => key.split('/')[1])
      .filter(Boolean);

    return {
      name: node.metadata?.name ?? '',
      ready: readyCondition?.status === 'True',
      unschedulable: Boolean(node.spec?.unschedulable),
      roles,
      version: node.status?.nodeInfo?.kubeletVersion ?? null,
      os: node.status?.nodeInfo?.osImage ?? null,
      ageSeconds: ageSeconds(node.metadata?.creationTimestamp),
      pods: podsByNode.get(node.metadata?.name) ?? 0,
      podCapacity: Number(node.status?.allocatable?.pods) || null,
      internalIP:
        (node.status?.addresses ?? []).find((a: Obj) => a.type === 'InternalIP')?.address ?? null,
      cpu: {
        allocatableMillis: allocCpu,
        requestedMillis: requests.cpuMillis,
        usedMillis: usage?.cpuMillis ?? null,
        requestedPercent: percent(requests.cpuMillis, allocCpu),
        usedPercent: percent(usage?.cpuMillis, allocCpu),
      },
      memory: {
        allocatableBytes: allocMemory,
        requestedBytes: requests.memoryBytes,
        usedBytes: usage?.memoryBytes ?? null,
        requestedPercent: percent(requests.memoryBytes, allocMemory),
        usedPercent: percent(usage?.memoryBytes, allocMemory),
      },
      taints: (node.spec?.taints ?? []).map((taint: Obj) => ({
        key: taint.key,
        effect: taint.effect,
      })),
    };
  });

  nodeView.sort((a, b) => a.name.localeCompare(b.name));

  const totalCpu = nodeView.reduce((sum, node) => sum + node.cpu.allocatableMillis, 0);
  const totalMemory = nodeView.reduce((sum, node) => sum + node.memory.allocatableBytes, 0);
  const requestedCpu = nodeView.reduce((sum, node) => sum + node.cpu.requestedMillis, 0);
  const requestedMemory = nodeView.reduce((sum, node) => sum + node.memory.requestedBytes, 0);
  const usedCpu = nodeMetrics.data ? nodeView.reduce((sum, node) => sum + (node.cpu.usedMillis ?? 0), 0) : null;
  const usedMemory = nodeMetrics.data ? nodeView.reduce((sum, node) => sum + (node.memory.usedBytes ?? 0), 0) : null;

  const deploymentView = deploymentItems
    .map((deployment) => {
      const desired = deployment.spec?.replicas ?? 0;
      const ready = deployment.status?.readyReplicas ?? 0;
      return {
        namespace: deployment.metadata?.namespace ?? '',
        name: deployment.metadata?.name ?? '',
        desired,
        ready,
        updated: deployment.status?.updatedReplicas ?? 0,
        available: deployment.status?.availableReplicas ?? 0,
        paused: Boolean(deployment.spec?.paused),
        degraded: !deployment.spec?.paused && ready < desired,
        ageSeconds: ageSeconds(deployment.metadata?.creationTimestamp),
      };
    })
    .sort((a, b) => Number(b.degraded) - Number(a.degraded) || a.name.localeCompare(b.name));

  const statefulView = statefulItems.map((item) => ({
    desired: item.spec?.replicas ?? 0,
    ready: item.status?.readyReplicas ?? 0,
  }));
  const daemonView = daemonItems.map((item) => ({
    desired: item.status?.desiredNumberScheduled ?? 0,
    ready: item.status?.numberReady ?? 0,
  }));

  const eventView = (events.data ?? [])
    .slice()
    .sort((a, b) => eventTimestamp(b) - eventTimestamp(a))
    .slice(0, 10)
    .map((event) => ({
      type: event.type,
      reason: event.reason,
      message: event.message,
      kind: event.involvedObject?.kind,
      name: event.involvedObject?.name,
      namespace: event.metadata?.namespace ?? event.involvedObject?.namespace,
      count: event.count ?? 1,
      lastSeen: event.lastTimestamp ?? event.eventTime ?? event.metadata?.creationTimestamp,
      ageSeconds: ageSeconds(event.lastTimestamp ?? event.eventTime ?? event.metadata?.creationTimestamp),
    }));

  const namespaceView = namespaceItems
    .map((ns) => ({
      name: ns.metadata?.name ?? '',
      pods: podsByNamespace.get(ns.metadata?.name) ?? 0,
      ageSeconds: ageSeconds(ns.metadata?.creationTimestamp),
      phase: ns.status?.phase ?? 'Active',
    }))
    .sort((a, b) => b.pods - a.pods || a.name.localeCompare(b.name));

  const readyNodes = nodeView.filter((node) => node.ready).length;

  return {
    body: {
      cluster: {
        id: t.clusterId,
        name: t.context.name,
        server: t.context.server,
        namespace: t.context.namespace,
      },
      version: await ctx.state.version(t.clusterId).catch(() => null),
      scope: { namespace: namespace ?? null },
      nodes: {
        total: nodeView.length,
        ready: readyNodes,
        unschedulable: nodeView.filter((node) => node.unschedulable).length,
        cpu: {
          allocatableMillis: totalCpu,
          requestedMillis: requestedCpu,
          usedMillis: usedCpu,
          requestedPercent: percent(requestedCpu, totalCpu),
          usedPercent: percent(usedCpu, totalCpu),
        },
        memory: {
          allocatableBytes: totalMemory,
          requestedBytes: requestedMemory,
          usedBytes: usedMemory,
          requestedPercent: percent(requestedMemory, totalMemory),
          usedPercent: percent(usedMemory, totalMemory),
        },
        items: nodeView,
      },
      pods: {
        total: podItems.length,
        ready: readyPods,
        notReady,
        running: byPhase.Running ?? 0,
        pending: byPhase.Pending ?? 0,
        succeeded: byPhase.Succeeded ?? 0,
        failed: byPhase.Failed ?? 0,
        unknown: byPhase.Unknown ?? 0,
        restarts,
        crashLoop,
        terminating,
        byPhase,
        truncated: podItems.length >= 3000,
      },
      workloads: {
        deployments: {
          total: deploymentView.length,
          ready: deploymentView.filter((item) => !item.degraded).length,
          degraded: deploymentView.filter((item) => item.degraded).length,
          items: deploymentView.slice(0, 8),
        },
        statefulSets: {
          total: statefulView.length,
          ready: statefulView.filter((item) => item.ready >= item.desired).length,
          degraded: statefulView.filter((item) => item.ready < item.desired).length,
        },
        daemonSets: {
          total: daemonView.length,
          ready: daemonView.filter((item) => item.ready >= item.desired).length,
          degraded: daemonView.filter((item) => item.ready < item.desired).length,
        },
      },
      usage: nodeMetrics.data
        ? {
            available: true,
            cpuMillis: usedCpu,
            memoryBytes: usedMemory,
            nodeCount: nodeMetrics.data.length,
          }
        : { available: false, cpuMillis: null, memoryBytes: null, nodeCount: 0 },
      namespaces: {
        total: namespaceItems.length,
        items: namespaceView,
      },
      events: eventView,
      problems: problems.slice(0, 8),
      warnings,
      generatedAt: new Date().toISOString(),
    },
  };
};
