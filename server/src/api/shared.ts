import { HttpError } from '../errors.js';
import type { Discovery, ApiResource } from '../k8s/discovery.js';
import type { KubeClient } from '../k8s/client.js';
import type { KubeContext } from '../kubeconfig.js';
import type { Gvr } from '../k8s/urls.js';
import { assertGvr } from '../k8s/urls.js';
import type { RequestContext } from '../http/context.js';
import { queryString } from '../http/context.js';

export interface Target {
  context: KubeContext;
  client: KubeClient;
  discovery: Discovery;
  clusterId: string;
}

export function target(ctx: RequestContext, clusterOverride?: string): Target {
  const clusterId = clusterOverride || queryString(ctx, 'cluster');
  const context = ctx.state.context(clusterId);
  return {
    context,
    client: ctx.state.client(context.id),
    discovery: ctx.state.discovery(context.id),
    clusterId: context.id,
  };
}

export interface ResolvedResource extends Target {
  resource: ApiResource;
  gvr: Gvr;
}

export async function resolveResource(ctx: RequestContext, clusterOverride?: string): Promise<ResolvedResource> {
  const t = target(ctx, clusterOverride);
  const group = queryString(ctx, 'group') ?? '';
  const version = queryString(ctx, 'version');
  const plural = queryString(ctx, 'plural');
  const kind = queryString(ctx, 'kind');

  let resource: ApiResource | undefined;
  if (version && plural) {
    resource = await t.discovery.byPlural(group, version, plural);
    if (!resource) {
      // Be permissive: clusters can have aggregated APIs that fail discovery.
      resource = {
        group,
        version,
        groupVersion: group ? `${group}/${version}` : version,
        plural,
        singular: plural,
        kind: kind ?? plural,
        namespaced: true,
        verbs: [],
        shortNames: [],
        categories: [],
      };
    }
  } else if (kind) {
    resource = await t.discovery.byKind(kind, group || undefined);
  }

  if (!resource) {
    throw new HttpError(400, 'Specify group, version and plural (or kind) for the target resource.');
  }

  const gvr = assertGvr({ group: resource.group, version: resource.version, plural: resource.plural });
  return { ...t, resource, gvr };
}

export function namespaceOf(ctx: RequestContext, resource: ApiResource): string | undefined {
  if (!resource.namespaced) return undefined;
  const namespace = queryString(ctx, 'namespace');
  if (!namespace || namespace === '_all' || namespace === '*') return undefined;
  return namespace;
}

/** Kubernetes list items omit kind/apiVersion; add them for generic UI rendering. */
export function ensureTypeMeta<T extends Record<string, any>>(
  item: T,
  resource: { kind: string; group: string; version: string },
): T {
  const object = item as Record<string, any>;
  if (!object.kind) object.kind = resource.kind;
  if (!object.apiVersion) {
    object.apiVersion = resource.group ? `${resource.group}/${resource.version}` : resource.version;
  }
  return item;
}

export function effectiveNamespace(ctx: RequestContext, resource: ApiResource): string {
  if (!resource.namespaced) return '';
  const namespace = queryString(ctx, 'namespace');
  return namespace && namespace !== '_all' && namespace !== '*' ? namespace : 'default';
}

export function requireWritable(ctx: RequestContext): void {
  if (ctx.state.config.readOnly) {
    throw new HttpError(403, 'KubeInsight is running in read-only mode.', 'READ_ONLY');
  }
}
