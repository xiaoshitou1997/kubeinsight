import { queryBool, queryString, type Handler } from '../http/context.js';
import { fetchNodeMetrics, fetchPodMetrics } from '../k8s/metrics.js';
import { target } from './shared.js';

export const metricsHandler: Handler = async (ctx) => {
  const t = target(ctx);
  const namespace = queryString(ctx, 'namespace');
  const nodesOnly = queryBool(ctx, 'nodesOnly');
  const [nodes, pods] = await Promise.all([
    fetchNodeMetrics(t.client),
    nodesOnly ? Promise.resolve(null) : fetchPodMetrics(t.client, namespace),
  ]);

  if (!nodes && !pods) {
    return {
      body: {
        cluster: t.clusterId,
        available: false,
        reason: 'metrics-server is not installed or not reachable',
        nodes: [],
        pods: [],
      },
    };
  }

  return {
    body: {
      cluster: t.clusterId,
      available: true,
      nodes: nodes ?? [],
      pods: pods ?? [],
      generatedAt: new Date().toISOString(),
    },
  };
};
