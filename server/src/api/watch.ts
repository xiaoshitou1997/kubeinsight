import { queryInt, queryString, type Handler } from '../http/context.js';
import { listQuery, resourcePath } from '../k8s/urls.js';
import { sanitizeObject } from '../k8s/sanitize.js';
import { namespaceOf, resolveResource } from './shared.js';

interface KubeList {
  apiVersion?: string;
  kind?: string;
  metadata?: { resourceVersion?: string; continue?: string; remainingItemCount?: number };
  items?: Array<Record<string, any>>;
}

export type WatchEventType = 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK' | 'ERROR' | string;

export interface WatchEvent {
  type: WatchEventType;
  object?: Record<string, any>;
  resourceVersion?: string;
}

/** Parse one newline-delimited Kubernetes watch event. */
export function parseWatchLine(line: string): WatchEvent | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed === '{}') return null;
  try {
    const parsed = JSON.parse(trimmed) as { type?: unknown; object?: unknown };
    if (typeof parsed?.type !== 'string') return null;
    const event: WatchEvent = { type: parsed.type };
    if (parsed.object && typeof parsed.object === 'object') {
      event.object = parsed.object as Record<string, any>;
    }
    if (event.type === 'BOOKMARK') {
      const resourceVersion = (event.object as { metadata?: { resourceVersion?: unknown } } | undefined)
        ?.metadata?.resourceVersion;
      if (typeof resourceVersion === 'string') event.resourceVersion = resourceVersion;
    }
    return event;
  } catch {
    return null;
  }
}

/** Create a newline delimited JSON parser for a Kubernetes watch stream. */
export function createWatchLineParser(onEvent: (event: WatchEvent) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    for (;;) {
      const index = buffer.indexOf('\n');
      if (index < 0) break;
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      const event = parseWatchLine(line);
      if (event) onEvent(event);
    }
  };
}

function sanitizeItem(item: Record<string, any>): Record<string, any> {
  sanitizeObject(item);
  return item;
}

export const watchHandler: Handler = async (ctx) => {
  const resolved = await resolveResource(ctx);
  const namespace = namespaceOf(ctx, resolved.resource);
  const limit = queryInt(ctx, 'limit', 250, 1, 1000);
  const labelSelector = queryString(ctx, 'labelSelector');
  const fieldSelector = queryString(ctx, 'fieldSelector');
  const path = resourcePath(resolved.gvr, { namespace });
  const selectors = listQuery({ labelSelector, fieldSelector, limit });
  const watchSelectors = listQuery({ labelSelector, fieldSelector });

  const list = await resolved.client.request<KubeList>(path, {
    query: selectors,
    timeoutMs: 45_000,
  });
  const items = (list.items ?? []).map(sanitizeItem);

  ctx.res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;
  let response: import('node:http').IncomingMessage | undefined;
  const write = (chunk: string): boolean => {
    if (closed || ctx.res.destroyed || ctx.res.writableEnded) return false;
    ctx.res.write(chunk);
    return true;
  };
  const send = (event: string, data: unknown): void => {
    write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send('update', {
    kind: 'snapshot',
    data: {
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
  });

  const close = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    response?.destroy();
    if (!ctx.res.writableEnded) ctx.res.end();
  };
  const heartbeat = setInterval(() => {
    if (!write(': ping\n\n')) close();
  }, 25_000);

  try {
    response = (await resolved.client.stream(path, {
      headers: { Accept: 'application/json' },
      query: {
        ...watchSelectors,
        watch: 'true',
        allowWatchBookmarks: 'true',
        resourceVersion: list.metadata?.resourceVersion,
        timeoutSeconds: 300,
      },
    })).response;
  } catch (error) {
    send('update', {
      kind: 'error',
      message: (error as Error).message,
    });
    close();
    return;
  }

  response.setEncoding('utf8');
  response.on('data', createWatchLineParser((event) => {
    if (event.object) sanitizeObject(event.object);
    send('update', { kind: 'event', event });
  }));
  response.on('end', () => {
    if (!closed) send('update', { kind: 'end' });
    close();
  });
  response.on('error', () => close());

  ctx.req.on('aborted', close);
  ctx.res.on('close', close);
};
