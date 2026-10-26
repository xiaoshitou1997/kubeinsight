import { HttpError } from '../errors.js';
import { queryString, requireQuery, type Handler } from '../http/context.js';
import { resourcePath } from '../k8s/urls.js';
import { requireWritable, resolveResource } from './shared.js';

interface ScaleBody {
  replicas?: number;
}

export const scaleHandler: Handler = async (ctx) => {
  requireWritable(ctx);
  const resolved = await resolveResource(ctx);
  const name = requireQuery(ctx, 'name');
  const namespace = requireQuery(ctx, 'namespace');
  const body = await ctx.readJson<ScaleBody>();
  const replicas = Number(body.replicas);
  if (!Number.isInteger(replicas) || replicas < 0 || replicas > 100_000) {
    throw new HttpError(400, 'replicas must be an integer between 0 and 100000.');
  }

  const scale = await resolved.client.request<Record<string, any>>(
    resourcePath(resolved.gvr, { namespace, name, subresource: 'scale' }),
    {
      method: 'PATCH',
      contentType: 'application/merge-patch+json',
      body: { spec: { replicas } },
    },
  );

  return {
    body: {
      ok: true,
      replicas: scale.spec?.replicas ?? replicas,
      status: scale.status ?? null,
    },
  };
};

export const restartHandler: Handler = async (ctx) => {
  requireWritable(ctx);
  const resolved = await resolveResource(ctx);
  const name = requireQuery(ctx, 'name');
  const namespace = requireQuery(ctx, 'namespace');
  const kind = resolved.resource.kind;
  if (!['Deployment', 'StatefulSet', 'DaemonSet'].includes(kind)) {
    throw new HttpError(400, 'Restart is only supported for Deployments, StatefulSets and DaemonSets.');
  }

  const now = new Date().toISOString();
  await resolved.client.request(resourcePath(resolved.gvr, { namespace, name }), {
    method: 'PATCH',
    contentType: 'application/merge-patch+json',
    body: {
      spec: {
        template: {
          metadata: {
            annotations: {
              'kubectl.kubernetes.io/restartedAt': now,
              'kubeinsight.io/restartedAt': now,
            },
          },
        },
      },
    },
  });

  return { body: { ok: true, restartedAt: now } };
};

interface CordonBody {
  unschedulable?: boolean;
}

export const cordonHandler: Handler = async (ctx) => {
  requireWritable(ctx);
  const name = requireQuery(ctx, 'name');
  const cluster = queryString(ctx, 'cluster');
  const body = await ctx.readJson<CordonBody>();
  const unschedulable = body.unschedulable !== false;

  const client = ctx.state.client(cluster);
  await client.request(`/api/v1/nodes/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    contentType: 'application/merge-patch+json',
    body: { spec: { unschedulable } },
  });

  return { body: { ok: true, unschedulable } };
};
