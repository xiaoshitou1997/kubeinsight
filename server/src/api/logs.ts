import { queryBool, queryInt, queryString, requireQuery, type Handler } from '../http/context.js';
import { assertSegment } from '../k8s/urls.js';
import { target } from './shared.js';

export const logsHandler: Handler = async (ctx) => {
  const t = target(ctx);
  const namespace = requireQuery(ctx, 'namespace');
  const pod = requireQuery(ctx, 'pod');
  assertSegment(namespace, 'namespace');
  assertSegment(pod, 'pod');

  const container = queryString(ctx, 'container');
  if (container) assertSegment(container, 'container');

  const follow = queryBool(ctx, 'follow');
  const tailLines = queryInt(ctx, 'tailLines', follow ? 200 : 500, 1, 10_000);
  const previous = queryBool(ctx, 'previous');
  const timestamps = queryBool(ctx, 'timestamps');
  const sinceSeconds = queryInt(ctx, 'sinceSeconds', 0, 0, 7 * 24 * 3600);

  const path = `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}/log`;
  const { response } = await t.client.stream(path, {
    headers: { Accept: '*/*' },
    query: {
      container,
      follow: follow ? 'true' : undefined,
      tailLines,
      previous: previous ? 'true' : undefined,
      timestamps: timestamps ? 'true' : undefined,
      sinceSeconds: sinceSeconds > 0 ? sinceSeconds : undefined,
      limitBytes: 20 * 1024 * 1024,
    },
  });

  ctx.res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
  });

  let finished = false;
  const destroy = () => {
    if (finished) return;
    finished = true;
    response.destroy();
  };
  ctx.req.on('aborted', destroy);
  ctx.res.on('close', destroy);
  response.on('error', () => {
    if (!ctx.res.writableEnded) ctx.res.destroy();
  });
  response.pipe(ctx.res);
  ctx.res.on('finish', () => {
    finished = true;
  });
};
