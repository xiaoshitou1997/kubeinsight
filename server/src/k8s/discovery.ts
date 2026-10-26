import type { KubeClient } from './client.js';

export interface ApiResource {
  group: string;
  version: string;
  groupVersion: string;
  kind: string;
  plural: string;
  singular: string;
  namespaced: boolean;
  verbs: string[];
  shortNames: string[];
  categories: string[];
}

interface ApiResourceList {
  groupVersion?: string;
  resources?: Array<{
    name: string;
    singularName?: string;
    namespaced?: boolean;
    kind?: string;
    verbs?: string[];
    shortNames?: string[];
    categories?: string[];
  }>;
}

interface ApiGroupList {
  groups?: Array<{
    name: string;
    preferredVersion?: { groupVersion?: string; version?: string };
    versions?: Array<{ groupVersion?: string; version?: string }>;
  }>;
}

interface CacheEntry {
  at: number;
  resources: ApiResource[];
  warnings: string[];
}

const TTL = 5 * 60_000;

export class Discovery {
  private cache?: CacheEntry;
  private inflight?: Promise<CacheEntry>;

  constructor(private readonly client: KubeClient) {}

  async resources(force = false): Promise<{ resources: ApiResource[]; warnings: string[] }> {
    if (!force && this.cache && Date.now() - this.cache.at < TTL) {
      return { resources: this.cache.resources, warnings: this.cache.warnings };
    }
    if (this.inflight) {
      const entry = await this.inflight;
      return { resources: entry.resources, warnings: entry.warnings };
    }
    this.inflight = this.load();
    try {
      const entry = await this.inflight;
      this.cache = entry;
      return { resources: entry.resources, warnings: entry.warnings };
    } finally {
      this.inflight = undefined;
    }
  }

  async byKind(kind: string, group?: string): Promise<ApiResource | undefined> {
    const { resources } = await this.resources();
    const matches = resources.filter(
      (r) => r.kind.toLowerCase() === kind.toLowerCase() && (!group || r.group === group),
    );
    if (matches.length === 0) return undefined;
    return matches.find((r) => r.group === '') ?? matches[0];
  }

  async byPlural(group: string, version: string, plural: string): Promise<ApiResource | undefined> {
    const { resources } = await this.resources();
    return resources.find((r) => r.group === group && r.version === version && r.plural === plural);
  }

  async has(group: string, version: string, plural: string): Promise<boolean> {
    return Boolean(await this.byPlural(group, version, plural));
  }

  invalidate() {
    this.cache = undefined;
  }

  private async load(): Promise<CacheEntry> {
    const warnings: string[] = [];
    const groupVersions = new Set<string>(['v1']);

    try {
      const groups = await this.client.request<ApiGroupList>('/apis');
      for (const group of groups.groups ?? []) {
        const preferred = group.preferredVersion?.groupVersion;
        const fallback = group.versions?.[0]?.groupVersion;
        const gv = preferred ?? fallback;
        if (gv) groupVersions.add(gv);
      }
    } catch (error) {
      warnings.push(`Could not list API groups: ${(error as Error).message}`);
    }

    // Metrics is served by an aggregated API and is always worth probing.
    groupVersions.add('metrics.k8s.io/v1beta1');

    const results = await mapLimit([...groupVersions], 8, async (gv) => {
      const path = gv === 'v1' ? '/api/v1' : `/apis/${gv}`;
      try {
        const list = await this.client.request<ApiResourceList>(path);
        return { gv, list };
      } catch (error) {
        if (gv !== 'metrics.k8s.io/v1beta1') {
          warnings.push(`Could not discover ${gv}: ${(error as Error).message}`);
        }
        return undefined;
      }
    });

    const resources: ApiResource[] = [];
    for (const result of results) {
      if (!result) continue;
      const { gv, list } = result;
      const slash = gv.indexOf('/');
      const group = slash === -1 ? '' : gv.slice(0, slash);
      const version = slash === -1 ? gv : gv.slice(slash + 1);
      for (const item of list.resources ?? []) {
        if (!item.name || item.name.includes('/') || !item.kind) continue;
        resources.push({
          group,
          version,
          groupVersion: gv,
          kind: item.kind,
          plural: item.name,
          singular: item.singularName || item.kind.toLowerCase(),
          namespaced: Boolean(item.namespaced),
          verbs: item.verbs ?? [],
          shortNames: item.shortNames ?? [],
          categories: item.categories ?? [],
        });
      }
    }

    return { at: Date.now(), resources, warnings };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}
