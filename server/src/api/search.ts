import { queryString, type Handler } from '../http/context.js';
import { podStatus } from '../k8s/sanitize.js';
import { resourcePath } from '../k8s/urls.js';
import { target } from './shared.js';
import type { ApiResource } from '../k8s/discovery.js';

interface SearchKind {
  kind: string;
  label: string;
  score: number;
  status?: (item: Record<string, any>) => string | undefined;
}

const KINDS: SearchKind[] = [
  { kind: 'Pod', label: 'Pod', score: 0, status: (item) => podStatus(item).reason },
  {
    kind: 'Deployment',
    label: 'Deployment',
    score: 1,
    status: (item) =>
      `${item.status?.readyReplicas ?? 0}/${item.spec?.replicas ?? 0}`,
  },
  { kind: 'StatefulSet', label: 'StatefulSet', score: 2 },
  { kind: 'DaemonSet', label: 'DaemonSet', score: 3 },
  { kind: 'Service', label: 'Service', score: 4 },
  { kind: 'Ingress', label: 'Ingress', score: 5 },
  { kind: 'ConfigMap', label: 'ConfigMap', score: 6 },
  { kind: 'CronJob', label: 'CronJob', score: 7 },
  { kind: 'Job', label: 'Job', score: 8 },
  { kind: 'Secret', label: 'Secret', score: 9 },
  { kind: 'Node', label: 'Node', score: 10 },
  { kind: 'Namespace', label: 'Namespace', score: 11 },
  { kind: 'CustomResourceDefinition', label: 'CRD', score: 12 },
];

interface SearchItem {
  kind: string;
  group: string;
  version: string;
  plural: string;
  namespace?: string;
  name: string;
  status?: string;
  score: number;
}

export const searchHandler: Handler = async (ctx) => {
  const t = target(ctx);
  const q = (queryString(ctx, 'q') ?? '').toLowerCase();
  const namespace = queryString(ctx, 'namespace');
  const limit = Math.min(60, Math.max(1, Number(queryString(ctx, 'limit')) || 30));
  if (q.length < 1) return { body: { cluster: t.clusterId, items: [], query: q } };

  const { resources } = await t.discovery.resources();
  const tasks = KINDS.map(async (definition) => {
    const resource = await resolve(resources, definition.kind);
    if (!resource) return [] as SearchItem[];
    if (!resource.verbs.includes('list')) return [] as SearchItem[];
    const ns = resource.namespaced ? namespace : undefined;
    try {
      const result = await t.client.request<{ items?: Array<Record<string, any>> }>(
        resourcePath({ group: resource.group, version: resource.version, plural: resource.plural }, { namespace: ns }),
        { query: { limit: 500 }, timeoutMs: 15_000 },
      );
      const items: SearchItem[] = [];
      for (const item of result.items ?? []) {
        const name = String(item.metadata?.name ?? '');
        const itemNamespace = item.metadata?.namespace;
        const nameLower = name.toLowerCase();
        let score: number | null = null;
        if (nameLower === q) score = 0;
        else if (nameLower.startsWith(q)) score = 1;
        else if (nameLower.includes(q)) score = 2;
        else if (itemNamespace && String(itemNamespace).toLowerCase().includes(q)) score = 3;
        if (score === null) continue;
        items.push({
          kind: definition.label,
          group: resource.group,
          version: resource.version,
          plural: resource.plural,
          namespace: itemNamespace,
          name,
          status: definition.status?.(item),
          score: definition.score * 10 + score,
        });
      }
      return items;
    } catch {
      return [] as SearchItem[];
    }
  });

  const results = (await Promise.all(tasks)).flat();
  results.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));

  return {
    body: {
      cluster: t.clusterId,
      query: q,
      items: results.slice(0, limit),
      truncated: results.length > limit,
    },
  };
};

async function resolve(resources: ApiResource[], kind: string): Promise<ApiResource | undefined> {
  const matches = resources.filter((r) => r.kind === kind);
  if (matches.length === 0) return undefined;
  return matches.find((r) => r.group === '') ?? matches[0];
}
