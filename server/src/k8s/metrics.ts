import type { KubeClient } from './client.js';
import { parseBytes, parseCpuMillis } from '../util/quantity.js';

export interface ContainerUsage {
  name: string;
  cpuMillis: number;
  memoryBytes: number;
}

export interface PodUsage {
  namespace: string;
  name: string;
  cpuMillis: number;
  memoryBytes: number;
  containers: ContainerUsage[];
}

export interface NodeUsage {
  name: string;
  cpuMillis: number;
  memoryBytes: number;
}

interface MetricsList {
  items?: Array<{
    metadata?: { name?: string; namespace?: string };
    timestamp?: string;
    window?: string;
    usage?: { cpu?: string; memory?: string };
    containers?: Array<{ name?: string; usage?: { cpu?: string; memory?: string } }>;
  }>;
}

export async function fetchNodeMetrics(client: KubeClient): Promise<NodeUsage[] | null> {
  try {
    const list = await client.request<MetricsList>('/apis/metrics.k8s.io/v1beta1/nodes', {
      timeoutMs: 15_000,
    });
    return (list.items ?? []).map((item) => ({
      name: item.metadata?.name ?? '',
      cpuMillis: parseCpuMillis(item.usage?.cpu) ?? 0,
      memoryBytes: parseBytes(item.usage?.memory) ?? 0,
    }));
  } catch {
    return null;
  }
}

export async function fetchPodMetrics(
  client: KubeClient,
  namespace?: string,
): Promise<PodUsage[] | null> {
  const path = namespace
    ? `/apis/metrics.k8s.io/v1beta1/namespaces/${encodeURIComponent(namespace)}/pods`
    : '/apis/metrics.k8s.io/v1beta1/pods';
  try {
    const list = await client.request<MetricsList>(path, { timeoutMs: 20_000 });
    return (list.items ?? []).map((item) => {
      const containers = (item.containers ?? []).map((container) => ({
        name: container.name ?? '',
        cpuMillis: parseCpuMillis(container.usage?.cpu) ?? 0,
        memoryBytes: parseBytes(container.usage?.memory) ?? 0,
      }));
      return {
        namespace: item.metadata?.namespace ?? '',
        name: item.metadata?.name ?? '',
        cpuMillis: containers.reduce((sum, c) => sum + c.cpuMillis, 0),
        memoryBytes: containers.reduce((sum, c) => sum + c.memoryBytes, 0),
        containers,
      };
    });
  } catch {
    return null;
  }
}
