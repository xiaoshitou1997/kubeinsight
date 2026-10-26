import { HttpError } from '../errors.js';
import { requireQuery, type Handler, type RequestContext } from '../http/context.js';
import { resourcePath } from '../k8s/urls.js';
import {
  buildImagePatch,
  buildMetadataPatch,
  buildResourcePatch,
  buildSchedulePatch,
  type ImageChange,
  type KubeObject,
  type MetadataChange,
  type ResourceChange,
  type ScheduleChange,
} from '../k8s/workload.js';
import { requireWritable, resolveResource } from './shared.js';

interface ActionBody {
  dryRun?: boolean;
}

interface Target {
  resolved: Awaited<ReturnType<typeof resolveResource>>;
  name: string;
  namespace?: string;
  object: KubeObject;
}

async function loadTarget(ctx: RequestContext): Promise<Target> {
  const resolved = await resolveResource(ctx);
  const name = requireQuery(ctx, 'name');
  const namespace = resolved.resource.namespaced ? requireQuery(ctx, 'namespace') : undefined;
  const object = await resolved.client.request<KubeObject>(
    resourcePath(resolved.gvr, { namespace, name }),
    { timeoutMs: 30_000 },
  );
  return { resolved, name, namespace, object };
}

async function patchResource(
  target: Target,
  patch: KubeObject,
  contentType: string,
  dryRun: boolean,
): Promise<KubeObject> {
  return target.resolved.client.request<KubeObject>(
    resourcePath(target.resolved.gvr, { namespace: target.namespace, name: target.name }),
    {
      method: 'PATCH',
      contentType,
      body: patch,
      query: { dryRun: dryRun ? 'All' : undefined },
      timeoutMs: 45_000,
    },
  );
}

interface ImageBody extends ActionBody {
  containers?: ImageChange[];
  initContainers?: ImageChange[];
}

export const imageUpdateHandler: Handler = async (ctx) => {
  requireWritable(ctx);
  const body = await ctx.readJson<ImageBody>();
  if (body.containers !== undefined && !Array.isArray(body.containers)) {
    throw new HttpError(400, 'containers must be an array.');
  }
  if (body.initContainers !== undefined && !Array.isArray(body.initContainers)) {
    throw new HttpError(400, 'initContainers must be an array.');
  }

  const target = await loadTarget(ctx);
  const kind = target.resolved.resource.kind;
  const { patch, changed } = buildImagePatch(
    target.object,
    kind,
    body.containers ?? [],
    body.initContainers ?? [],
  );
  const updated = await patchResource(
    target,
    patch,
    'application/strategic-merge-patch+json',
    Boolean(body.dryRun),
  );

  return {
    body: {
      ok: true,
      changed,
      dryRun: Boolean(body.dryRun),
      resourceVersion: updated.metadata?.resourceVersion,
    },
  };
};

interface ResourcesBody extends ActionBody {
  containers?: ResourceChange[];
}

export const resourcesUpdateHandler: Handler = async (ctx) => {
  requireWritable(ctx);
  const body = await ctx.readJson<ResourcesBody>();
  if (!Array.isArray(body.containers)) {
    throw new HttpError(400, 'containers must be an array.');
  }

  const target = await loadTarget(ctx);
  const kind = target.resolved.resource.kind;
  const { patch, changed } = buildResourcePatch(target.object, kind, body.containers);
  const updated = await patchResource(
    target,
    patch,
    'application/strategic-merge-patch+json',
    Boolean(body.dryRun),
  );

  return {
    body: {
      ok: true,
      changed,
      dryRun: Boolean(body.dryRun),
      resourceVersion: updated.metadata?.resourceVersion,
    },
  };
};

interface MetadataBody extends ActionBody, MetadataChange {}

export const metadataUpdateHandler: Handler = async (ctx) => {
  requireWritable(ctx);
  const body = await ctx.readJson<MetadataBody>();
  const target = await loadTarget(ctx);
  const patch = buildMetadataPatch(body);

  const updated = await patchResource(
    target,
    patch,
    'application/merge-patch+json',
    Boolean(body.dryRun),
  );
  return {
    body: {
      ok: true,
      dryRun: Boolean(body.dryRun),
      resourceVersion: updated.metadata?.resourceVersion,
    },
  };
};

interface ScheduleBody extends ActionBody, ScheduleChange {}

export const scheduleUpdateHandler: Handler = async (ctx) => {
  requireWritable(ctx);
  const body = await ctx.readJson<ScheduleBody>();
  const target = await loadTarget(ctx);
  const patch = buildSchedulePatch(target.resolved.resource.kind, body);
  const updated = await patchResource(
    target,
    patch,
    'application/merge-patch+json',
    Boolean(body.dryRun),
  );
  return {
    body: {
      ok: true,
      dryRun: Boolean(body.dryRun),
      resourceVersion: updated.metadata?.resourceVersion,
    },
  };
};
