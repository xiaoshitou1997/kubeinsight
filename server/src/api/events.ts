import { queryInt, queryString, type Handler } from '../http/context.js';
import { ageSeconds, eventTimestamp } from '../k8s/sanitize.js';
import type { KubeClient } from '../k8s/client.js';
import { target } from './shared.js';

interface KubeList {
  items?: Array<Record<string, any>>;
  metadata?: { continue?: string };
}

export const eventsHandler: Handler = async (ctx) => {
  const t = target(ctx);
  const namespace = queryString(ctx, 'namespace');
  const limit = queryInt(ctx, 'limit', 300, 1, 1000);
  const type = queryString(ctx, 'type');
  const kind = queryString(ctx, 'kind');
  const name = queryString(ctx, 'name');
  const search = queryString(ctx, 'q')?.toLowerCase();

  const path = namespace
    ? `/api/v1/namespaces/${encodeURIComponent(namespace)}/events`
    : '/api/v1/events';

  const selectors: string[] = [];
  if (type === 'Warning' || type === 'Normal') selectors.push(`type=${type}`);
  if (kind) selectors.push(`involvedObject.kind=${kind}`);
  if (name) selectors.push(`involvedObject.name=${name}`);

  const items = await fetchEventPages(t.client, path, selectors.join(','), limit, Boolean(search));

  const filtered = items.filter((event) => {
    if (!search) return true;
    const haystack = [
      event.reason,
      event.message,
      event.involvedObject?.name,
      event.involvedObject?.kind,
      event.metadata?.namespace,
      event.source?.component,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(search);
  });

  const events = filtered
    .slice()
    .sort((a, b) => eventTimestamp(b) - eventTimestamp(a))
    .slice(0, limit)
    .map((event) => ({
      type: event.type ?? 'Normal',
      reason: event.reason ?? '',
      message: event.message ?? '',
      count: event.count ?? event.series?.count ?? 1,
      kind: event.involvedObject?.kind ?? '',
      name: event.involvedObject?.name ?? '',
      namespace: event.metadata?.namespace ?? event.involvedObject?.namespace ?? '',
      component: event.source?.component ?? event.reportingComponent ?? '',
      host: event.source?.host ?? event.reportingInstance ?? '',
      firstSeen: event.firstTimestamp ?? event.metadata?.creationTimestamp,
      lastSeen: event.lastTimestamp ?? event.eventTime ?? event.metadata?.creationTimestamp,
      ageSeconds: ageSeconds(event.lastTimestamp ?? event.eventTime ?? event.metadata?.creationTimestamp),
      uid: event.metadata?.uid,
      apiVersion: event.involvedObject?.apiVersion,
      resourceVersion: event.involvedObject?.resourceVersion,
      fieldPath: event.involvedObject?.fieldPath,
    }));

  return {
    body: {
      cluster: t.clusterId,
      namespace: namespace ?? null,
      items: events,
      total: events.length,
    },
  };
};

async function fetchEventPages(
  client: KubeClient,
  path: string,
  fieldSelector: string,
  limit: number,
  needMore: boolean,
): Promise<Array<Record<string, any>>> {
  const items: Array<Record<string, any>> = [];
  let continueToken: string | undefined;
  let pages = 0;
  const maxPages = needMore ? 4 : 1;

  do {
    const result = await client.request<KubeList>(path, {
      query: {
        limit: Math.min(limit, 500),
        continue: continueToken,
        fieldSelector: fieldSelector || undefined,
      },
      timeoutMs: 30_000,
    });
    items.push(...(result.items ?? []));
    continueToken = result.metadata?.continue;
    pages += 1;
  } while (continueToken && pages < maxPages);

  return items;
}
