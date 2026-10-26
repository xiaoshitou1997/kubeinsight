import type { KubeObject } from '../types';

export interface PodStatusView {
  phase: string;
  reason: string;
  ready: boolean;
  restarts: number;
}

export type BadgeTone = 'ok' | 'warn' | 'err' | 'info' | 'neutral' | 'muted';

export function podStatus(pod: KubeObject): PodStatusView {
  const phase: string = pod.status?.phase ?? 'Unknown';
  const containers: KubeObject[] = pod.status?.containerStatuses ?? [];
  const ready = containers.length > 0 && containers.every((container) => container.ready);
  const restarts = containers.reduce((sum, container) => sum + (container.restartCount ?? 0), 0);

  if (pod.metadata?.deletionTimestamp) {
    return { phase, reason: 'Terminating', ready, restarts };
  }

  let reason = phase;
  for (const container of containers) {
    if (container.state?.waiting?.reason) {
      reason = container.state.waiting.reason;
      break;
    }
  }
  if (reason === 'Running' && !ready) reason = 'NotReady';
  return { phase, reason, ready, restarts };
}

export function podReadyCount(pod: KubeObject): { ready: number; total: number } {
  const containers: KubeObject[] = pod.status?.containerStatuses ?? pod.spec?.containers ?? [];
  const ready = (pod.status?.containerStatuses ?? []).filter((c: KubeObject) => c.ready).length;
  return { ready, total: containers.length };
}

export function statusTone(reason: string | undefined): BadgeTone {
  if (!reason) return 'neutral';
  const ok = [
    'Running',
    'Ready',
    'Active',
    'Bound',
    'Available',
    'Completed',
    'Succeeded',
    'Healthy',
    'Established',
    'Normal',
    'True',
    'AllReady',
    'Deployed',
  ];
  const warn = [
    'Pending',
    'ContainerCreating',
    'PodInitializing',
    'Terminating',
    'NotReady',
    'Progressing',
    'Suspended',
    'Updating',
    'Unknown',
    'Warning',
    'InProgress',
    'Scheduling',
    'Init',
    'WaitForFirstConsumer',
  ];
  if (ok.includes(reason)) return 'ok';
  if (warn.includes(reason)) return 'warn';
  return 'err';
}

export function nodeReady(node: KubeObject): boolean {
  const condition = (node.status?.conditions ?? []).find((c: KubeObject) => c.type === 'Ready');
  return condition?.status === 'True';
}

export function nodeRoles(node: KubeObject): string[] {
  const roles = Object.keys(node.metadata?.labels ?? {})
    .filter((key) => key.startsWith('node-role.kubernetes.io/'))
    .map((key) => key.split('/')[1])
    .filter(Boolean);
  return roles.length > 0 ? roles : ['worker'];
}

export function deploymentReady(deployment: KubeObject): { ready: number; desired: number } {
  return {
    ready: deployment.status?.readyReplicas ?? 0,
    desired: deployment.spec?.replicas ?? 0,
  };
}

export function containersOf(object: KubeObject): KubeObject[] {
  return [
    ...(object.spec?.template?.spec?.containers ?? []),
    ...(object.spec?.containers ?? []),
    ...(object.spec?.initContainers ?? []),
  ];
}

export function imagesOf(object: KubeObject): string[] {
  return containersOf(object)
    .map((container) => String(container.image ?? ''))
    .filter(Boolean);
}

export function matchLabelsToSelector(matchLabels: Record<string, string> | undefined): string {
  if (!matchLabels) return '';
  return Object.entries(matchLabels)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

export function servicePorts(service: KubeObject): string {
  return (service.spec?.ports ?? [])
    .map((port: KubeObject) => {
      const protocol = port.protocol ?? 'TCP';
      const nodePort = port.nodePort ? `:${port.nodePort}` : '';
      return `${port.port}${nodePort}/${protocol}`;
    })
    .join(', ');
}

export function ingressHosts(ingress: KubeObject): string {
  const hosts = (ingress.spec?.rules ?? []).map((rule: KubeObject) => rule.host).filter(Boolean);
  return hosts.length > 0 ? hosts.join(', ') : '*';
}

export function ingressAddress(ingress: KubeObject): string {
  const addresses = (ingress.status?.loadBalancer?.ingress ?? [])
    .map((entry: KubeObject) => entry.ip ?? entry.hostname)
    .filter(Boolean);
  return addresses.length > 0 ? String(addresses[0]) : '—';
}

export function jobStatus(job: KubeObject): string {
  if (job.status?.conditions?.some((c: KubeObject) => c.type === 'Complete' && c.status === 'True')) {
    return 'Completed';
  }
  if (job.status?.conditions?.some((c: KubeObject) => c.type === 'Failed' && c.status === 'True')) {
    return 'Failed';
  }
  return 'Running';
}

export function cronJobStatus(cronJob: KubeObject): string {
  return cronJob.spec?.suspend ? 'Suspended' : 'Active';
}

export function ownerOf(object: KubeObject): string {
  const owner = object.metadata?.ownerReferences?.[0];
  return owner ? `${owner.kind}/${owner.name}` : '—';
}

export function selectorOf(object: KubeObject): string {
  const selector = object.spec?.selector;
  if (!selector) return '';
  if (selector.matchLabels) return matchLabelsToSelector(selector.matchLabels);
  if (Array.isArray(selector.matchExpressions)) {
    return selector.matchExpressions
      .map((expr: KubeObject) => `${expr.key} ${expr.operator} ${(expr.values ?? []).join('|')}`)
      .join(', ');
  }
  if (object.spec?.selector && typeof object.spec.selector === 'object' && !object.spec.selector.matchLabels) {
    return matchLabelsToSelector(object.spec.selector);
  }
  return '';
}

export function objectKeys(object: KubeObject, field: 'data' | 'stringData' = 'data'): string[] {
  return Object.keys(object[field] ?? {}).sort();
}

export function pvcCapacity(pvc: KubeObject): string {
  return pvc.status?.capacity?.storage ?? pvc.spec?.resources?.requests?.storage ?? '—';
}

export function shortImage(image: string): string {
  const withoutDigest = image.split('@')[0];
  const parts = withoutDigest.split('/');
  return parts.length > 2 ? parts.slice(-2).join('/') : withoutDigest;
}

export function readyRatio(ready: number, total: number): string {
  return `${ready}/${total}`;
}

export function isHealthyRatio(ready: number, total: number): boolean {
  return total === 0 ? true : ready >= total;
}

export function genericStatus(object: KubeObject): string {
  switch (object.kind) {
    case 'Pod':
      return podStatus(object).reason;
    case 'Node':
      return nodeReady(object) ? 'Ready' : 'NotReady';
    case 'Deployment':
    case 'StatefulSet':
    case 'ReplicaSet': {
      const ready = object.status?.readyReplicas ?? 0;
      const desired = object.spec?.replicas ?? 0;
      return ready >= desired ? 'Ready' : 'Degraded';
    }
    case 'DaemonSet': {
      const ready = object.status?.numberReady ?? 0;
      const desired = object.status?.desiredNumberScheduled ?? 0;
      return ready >= desired ? 'Ready' : 'Degraded';
    }
    case 'Job':
      return jobStatus(object);
    case 'CronJob':
      return cronJobStatus(object);
    case 'CustomResourceDefinition': {
      const condition = (object.status?.conditions ?? []).find(
        (entry: KubeObject) => entry.type === 'Established',
      );
      return condition?.status === 'True' ? 'Established' : 'Pending';
    }
    default:
      break;
  }
  const phase = object.status?.phase;
  if (phase) return String(phase);
  const conditions: KubeObject[] = object.status?.conditions ?? [];
  const ready = conditions.find((entry) => entry.type === 'Ready' || entry.type === 'Available');
  if (ready) return ready.status === 'True' ? 'Ready' : String(ready.reason ?? 'NotReady');
  if (object.spec?.suspend) return 'Suspended';
  return 'Active';
}

export function containerState(containerStatus: KubeObject | undefined): { label: string; tone: BadgeTone } {
  if (!containerStatus) return { label: 'Waiting', tone: 'warn' };
  if (containerStatus.state?.running) return { label: 'Running', tone: 'ok' };
  if (containerStatus.state?.terminated) {
    const reason = containerStatus.state.terminated.reason ?? 'Terminated';
    return { label: reason, tone: reason === 'Completed' ? 'ok' : 'err' };
  }
  if (containerStatus.state?.waiting) {
    const reason = containerStatus.state.waiting.reason ?? 'Waiting';
    return { label: reason, tone: 'warn' };
  }
  return { label: containerStatus.ready ? 'Ready' : 'NotReady', tone: containerStatus.ready ? 'ok' : 'warn' };
}

export function decodeSecretValue(value: string | undefined): string {
  if (!value) return '';
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    if (/^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]*$/.test(decoded)) return decoded;
    return value;
  } catch {
    return value;
  }
}

export function containerResources(container: KubeObject): string {
  const requests = container.resources?.requests ?? {};
  const limits = container.resources?.limits ?? {};
  return [`req ${requests.cpu ?? '—'}/${requests.memory ?? '—'}`, `lim ${limits.cpu ?? '—'}/${limits.memory ?? '—'}`].join(
    ' · ',
  );
}
