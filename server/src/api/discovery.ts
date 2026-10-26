import { HttpError } from '../errors.js';
import { queryString, type Handler } from '../http/context.js';
import { target } from './shared.js';

export const discoveryHandler: Handler = async (ctx) => {
  const t = target(ctx);
  const force = queryString(ctx, 'refresh') === '1';
  const { resources, warnings } = await t.discovery.resources(force);
  return {
    body: {
      cluster: t.clusterId,
      resources: resources.sort((a, b) =>
        a.group === b.group ? a.kind.localeCompare(b.kind) : a.group.localeCompare(b.group),
      ),
      warnings,
    },
  };
};

export const healthHandler: Handler = async (ctx) => {
  return {
    body: {
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - ctx.state.startedAt) / 1000),
      contexts: ctx.state.contexts.length,
    },
  };
};

export function assertClusterAvailable(ctx: Parameters<Handler>[0]): void {
  if (!ctx.state.hasContexts()) {
    throw new HttpError(503, 'No Kubernetes context configured', 'NO_CLUSTER');
  }
}
