import path from 'node:path';
import { basename } from 'node:path';
import { queryString, type Handler } from '../http/context.js';
import { log } from '../logger.js';

export const metaHandler: Handler = async (ctx) => {
  const { state } = ctx;
  const requested = queryString(ctx, 'cluster');
  const clusterId = requested && state.contexts.some((c) => c.id === requested) ? requested : state.defaultContextId;

  const clusters = state.contexts.map((context) => ({
    id: context.id,
    name: context.name,
    server: context.server,
    namespace: context.namespace,
    source: basename(context.source || '') || undefined,
    warnings: context.warnings,
    insecure: context.insecureSkipTlsVerify,
    auth: context.auth.kind,
  }));

  let version: { major: string; minor: string; gitVersion: string; platform: string } | null = null;
  let reachable = false;
  let error: string | undefined;

  if (clusterId) {
    try {
      version = await state.version(clusterId);
      reachable = true;
    } catch (err) {
      error = (err as Error).message;
      log.warn('Cluster not reachable', { cluster: clusterId, error });
    }
  }

  return {
    body: {
      app: { name: 'KubeInsight', version: state.config.version, startedAt: state.startedAt },
      clusters,
      defaultCluster: state.defaultContextId ?? null,
      cluster: clusterId ?? null,
      version,
      reachable,
      error,
      warnings: state.kube.warnings,
      readOnly: state.config.readOnly,
      execEnabled: state.config.allowExec && !state.config.readOnly,
      authEnabled: Boolean(state.config.authToken),
      runtime: { node: process.version, platform: process.platform },
      kubeconfigSource: state.kube.source ? path.basename(state.kube.source) : null,
    },
  };
};
