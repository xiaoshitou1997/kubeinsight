import { parseAllDocuments } from 'yaml';
import { HttpError, KubeError } from '../errors.js';
import { queryBool, queryInt, queryString, requireQuery, type Handler } from '../http/context.js';
import { listQuery, resourcePath, type Gvr } from '../k8s/urls.js';
import { applyBody, editableYaml, sanitizeObject } from '../k8s/sanitize.js';
import { namespaceOf, requireWritable, resolveResource, target } from './shared.js';

interface KubeList {
  apiVersion?: string;
  kind?: string;
  metadata?: { resourceVersion?: string; continue?: string; remainingItemCount?: number };
  items?: Array<Record<string, any>>;
}

export const listResourcesHandler: Handler = async (ctx) => {
  const resolved = await resolveResource(ctx);
  const namespace = namespaceOf(ctx, resolved.resource);
  const limit = queryInt(ctx, 'limit', 250, 1, 1000);

  const list = await resolved.client.request<KubeList>(resourcePath(resolved.gvr, { namespace }), {
    query: {
      ...listQuery({
        labelSelector: queryString(ctx, 'labelSelector'),
        fieldSelector: queryString(ctx, 'fieldSelector'),
        limit,
        continue: queryString(ctx, 'continue'),
      }),
    },
    timeoutMs: 45_000,
  });

  const items = (list.items ?? []).map((item) => {
    sanitizeObject(item);
    if (item.kind === 'Secret') {
      item._masked = true;
      item._keys = Object.keys(item.data ?? item.stringData ?? {}).sort();
      delete item.data;
      delete item.stringData;
      delete item.binaryData;
    }
    return item;
  });

  return {
    body: {
      cluster: resolved.clusterId,
      resource: {
        group: resolved.resource.group,
        version: resolved.resource.version,
        plural: resolved.resource.plural,
        kind: resolved.resource.kind,
        namespaced: resolved.resource.namespaced,
      },
      namespace: namespace ?? null,
      items,
      continue: list.metadata?.continue ?? null,
      resourceVersion: list.metadata?.resourceVersion ?? null,
      remainingItemCount: list.metadata?.remainingItemCount ?? null,
    },
  };
};

export const getResourceHandler: Handler = async (ctx) => {
  const resolved = await resolveResource(ctx);
  const name = requireQuery(ctx, 'name');
  const namespace = resolved.resource.namespaced ? requireQuery(ctx, 'namespace') : undefined;
  const reveal = queryBool(ctx, 'reveal');
  const object = await resolved.client.request<Record<string, any>>(
    resourcePath(resolved.gvr, { namespace, name }),
  );

  const masked = resolved.resource.kind === 'Secret' && !reveal;
  sanitizeObject(object, { revealSecrets: !masked });

  return {
    body: {
      object,
      yaml: editableYaml(object),
      resource: {
        group: resolved.resource.group,
        version: resolved.resource.version,
        plural: resolved.resource.plural,
        kind: resolved.resource.kind,
        namespaced: resolved.resource.namespaced,
        verbs: resolved.resource.verbs,
      },
      masked,
      keys: masked ? object._keys ?? [] : undefined,
    },
  };
};

interface ApplyBody {
  cluster?: string;
  namespace?: string;
  force?: boolean;
  yaml?: string;
  dryRun?: boolean;
}

interface ApplyResult {
  ok: boolean;
  kind?: string;
  apiVersion?: string;
  name?: string;
  namespace?: string;
  error?: { message: string; status?: number; reason?: string };
}

export const applyHandler: Handler = async (ctx) => {
  requireWritable(ctx);
  const body = await ctx.readJson<ApplyBody>();
  const yamlText = typeof body.yaml === 'string' ? body.yaml : '';
  if (!yamlText.trim()) throw new HttpError(400, 'Request body must include a YAML document in "yaml".');

  const t = target(ctx, body.cluster);
  const { resources } = await t.discovery.resources();
  const defaultNamespace = body.namespace || t.context.namespace || 'default';

  let docs: unknown[] = [];
  try {
    const parsed = parseAllDocuments(yamlText);
    for (const doc of parsed) {
      if (doc.errors.length > 0) {
        throw new Error(doc.errors[0].message);
      }
      const value = doc.toJS();
      if (value && typeof value === 'object') docs.push(value);
    }
  } catch (error) {
    throw new HttpError(400, `Invalid YAML: ${(error as Error).message}`);
  }

  const expanded: Array<Record<string, any>> = [];
  for (const doc of docs) {
    const object = doc as Record<string, any>;
    if (object.kind === 'List' && Array.isArray(object.items)) {
      for (const item of object.items) if (item && typeof item === 'object') expanded.push(item);
    } else {
      expanded.push(object);
    }
  }

  if (expanded.length === 0) throw new HttpError(400, 'The YAML contains no Kubernetes objects.');
  if (expanded.length > 100) throw new HttpError(400, 'Refusing to apply more than 100 objects at once.');

  const results: ApplyResult[] = [];

  for (const object of expanded) {
    const apiVersion = String(object.apiVersion ?? '');
    const kind = String(object.kind ?? '');
    const name = String(object.metadata?.name ?? '');
    const result: ApplyResult = { ok: false, kind, apiVersion, name };

    if (!apiVersion || !kind || !name) {
      result.error = { message: 'Each object needs apiVersion, kind and metadata.name.' };
      results.push(result);
      continue;
    }

    const slash = apiVersion.indexOf('/');
    const group = slash === -1 ? '' : apiVersion.slice(0, slash);
    const version = slash === -1 ? apiVersion : apiVersion.slice(slash + 1);
    const resource = resources.find(
      (r) => r.group === group && r.version === version && r.kind.toLowerCase() === kind.toLowerCase(),
    );
    if (!resource) {
      result.error = { message: `Server does not recognize ${apiVersion} ${kind}.` };
      results.push(result);
      continue;
    }

    let namespace: string | undefined;
    if (resource.namespaced) {
      namespace = String(object.metadata?.namespace || defaultNamespace);
      object.metadata.namespace = namespace;
    } else {
      delete object.metadata?.namespace;
    }
    result.namespace = namespace;

    const gvr: Gvr = { group: resource.group, version: resource.version, plural: resource.plural };
    try {
      const applied = await t.client.request<Record<string, any>>(resourcePath(gvr, { namespace, name }), {
        method: 'PATCH',
        contentType: 'application/apply-patch+yaml',
        query: {
          fieldManager: 'kubeinsight',
          force: body.force ? 'true' : undefined,
          dryRun: body.dryRun ? 'All' : undefined,
        },
        body: applyBody(object),
        timeoutMs: 45_000,
      });
      result.ok = true;
      result.name = applied.metadata?.name ?? name;
    } catch (error) {
      if (error instanceof KubeError) {
        result.error = {
          message: error.message,
          status: error.status,
          reason: error.reason,
        };
      } else {
        result.error = { message: (error as Error).message };
      }
    }
    results.push(result);
  }

  return {
    status: results.every((r) => r.ok) ? 200 : 207,
    body: { ok: results.every((r) => r.ok), results },
  };
};

interface DeleteBody {
  cluster?: string;
  namespace?: string;
  propagationPolicy?: string;
  gracePeriodSeconds?: number;
}

export const deleteResourceHandler: Handler = async (ctx) => {
  requireWritable(ctx);
  const resolved = await resolveResource(ctx);
  const name = requireQuery(ctx, 'name');
  const namespace = resolved.resource.namespaced ? requireQuery(ctx, 'namespace') : undefined;
  const body = await ctx.readJson<DeleteBody>();
  const propagationPolicy = body.propagationPolicy ?? 'Background';
  if (!['Background', 'Foreground', 'Orphan'].includes(propagationPolicy)) {
    throw new HttpError(400, 'propagationPolicy must be Background, Foreground or Orphan');
  }

  await resolved.client.request(resourcePath(resolved.gvr, { namespace, name }), {
    method: 'DELETE',
    body: {
      apiVersion: 'v1',
      kind: 'DeleteOptions',
      propagationPolicy,
      ...(body.gracePeriodSeconds !== undefined
        ? { gracePeriodSeconds: Math.max(0, Math.trunc(body.gracePeriodSeconds)) }
        : {}),
    },
    timeoutMs: 45_000,
  });

  return { body: { ok: true } };
};
