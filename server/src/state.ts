import type { AppConfig } from './config.js';
import { HttpError } from './errors.js';
import { contextById, type KubeConfigSet, type KubeContext } from './kubeconfig.js';
import { KubeClient } from './k8s/client.js';
import { Discovery } from './k8s/discovery.js';

interface VersionInfo {
  major: string;
  minor: string;
  gitVersion: string;
  platform: string;
}

interface Cached<T> {
  at: number;
  value: T;
}

export class AppState {
  readonly startedAt = Date.now();
  private readonly clients = new Map<string, KubeClient>();
  private readonly discoveries = new Map<string, Discovery>();
  private readonly versions = new Map<string, Cached<VersionInfo>>();
  readonly defaultContextId?: string;

  constructor(
    readonly config: AppConfig,
    readonly kube: KubeConfigSet,
  ) {
    if (config.contextName && kube.contexts.some((c) => c.id === config.contextName)) {
      this.defaultContextId = config.contextName;
    } else {
      this.defaultContextId = kube.currentContext;
    }
  }

  get contexts(): KubeContext[] {
    return this.kube.contexts;
  }

  hasContexts(): boolean {
    return this.kube.contexts.length > 0;
  }

  context(id?: string): KubeContext {
    if (!this.hasContexts()) {
      throw new HttpError(
        503,
        'No Kubernetes context is configured. Mount a kubeconfig at ~/.kube/config (or set KUBECONFIG) and restart KubeInsight.',
        'NO_CLUSTER',
      );
    }
    const resolved = contextById(this.kube, id || this.defaultContextId);
    if (!resolved) {
      throw new HttpError(404, `Unknown cluster context: ${id}`, 'UNKNOWN_CONTEXT');
    }
    return resolved;
  }

  client(id?: string): KubeClient {
    const ctx = this.context(id);
    let client = this.clients.get(ctx.id);
    if (!client) {
      client = new KubeClient(ctx);
      this.clients.set(ctx.id, client);
    }
    return client;
  }

  discovery(id?: string): Discovery {
    const ctx = this.context(id);
    let discovery = this.discoveries.get(ctx.id);
    if (!discovery) {
      discovery = new Discovery(this.client(id));
      this.discoveries.set(ctx.id, discovery);
    }
    return discovery;
  }

  async version(id?: string): Promise<VersionInfo> {
    const ctx = this.context(id);
    const cached = this.versions.get(ctx.id);
    if (cached && Date.now() - cached.at < 60_000) return cached.value;
    const value = await this.client(id).request<VersionInfo>('/version');
    this.versions.set(ctx.id, { at: Date.now(), value });
    return value;
  }
}
