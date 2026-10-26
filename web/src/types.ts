export interface ClusterInfo {
  id: string;
  name: string;
  server: string;
  namespace: string;
  source?: string;
  warnings: string[];
  insecure: boolean;
  auth: string;
}

export interface ServerVersion {
  major: string;
  minor: string;
  gitVersion: string;
  platform: string;
}

export interface Meta {
  app: { name: string; version: string; startedAt: number };
  clusters: ClusterInfo[];
  defaultCluster: string | null;
  cluster: string | null;
  version: ServerVersion | null;
  reachable: boolean;
  error?: string;
  warnings: string[];
  readOnly: boolean;
  execEnabled: boolean;
  authEnabled: boolean;
  runtime?: { node: string; platform: string };
  kubeconfigSource: string | null;
}

export type KubeObject = Record<string, any>;

export interface ResourceRef {
  key?: string;
  group: string;
  version: string;
  plural: string;
  kind: string;
  namespace?: string;
  name: string;
  namespaced?: boolean;
}

export interface ResourceInfo {
  group: string;
  version: string;
  plural: string;
  kind: string;
  namespaced: boolean;
  verbs?: string[];
}

export interface ListResponse {
  cluster: string;
  resource: ResourceInfo;
  namespace: string | null;
  items: KubeObject[];
  continue: string | null;
  resourceVersion: string | null;
  remainingItemCount: number | null;
}

export interface ObjectResponse {
  object: KubeObject;
  yaml: string;
  resource: ResourceInfo;
  masked: boolean;
  keys?: string[];
}

export interface NodeView {
  name: string;
  ready: boolean;
  unschedulable: boolean;
  roles: string[];
  version: string | null;
  os: string | null;
  ageSeconds: number | null;
  pods: number;
  podCapacity: number | null;
  internalIP: string | null;
  cpu: {
    allocatableMillis: number;
    requestedMillis: number;
    usedMillis: number | null;
    requestedPercent: number | null;
    usedPercent: number | null;
  };
  memory: {
    allocatableBytes: number;
    requestedBytes: number;
    usedBytes: number | null;
    requestedPercent: number | null;
    usedPercent: number | null;
  };
  taints: Array<{ key: string; effect: string }>;
}

export interface Overview {
  cluster: { id: string; name: string; server: string; namespace: string };
  version: ServerVersion | null;
  scope: { namespace: string | null };
  nodes: {
    total: number;
    ready: number;
    unschedulable: number;
    cpu: {
      allocatableMillis: number;
      requestedMillis: number;
      usedMillis: number | null;
      requestedPercent: number | null;
      usedPercent: number | null;
    };
    memory: {
      allocatableBytes: number;
      requestedBytes: number;
      usedBytes: number | null;
      requestedPercent: number | null;
      usedPercent: number | null;
    };
    items: NodeView[];
  };
  pods: {
    total: number;
    ready: number;
    notReady: number;
    running: number;
    pending: number;
    succeeded: number;
    failed: number;
    unknown: number;
    restarts: number;
    crashLoop: number;
    terminating: number;
    byPhase: Record<string, number>;
    truncated: boolean;
  };
  workloads: {
    deployments: {
      total: number;
      ready: number;
      degraded: number;
      items: Array<{
        namespace: string;
        name: string;
        desired: number;
        ready: number;
        updated: number;
        available: number;
        paused: boolean;
        degraded: boolean;
        ageSeconds: number | null;
      }>;
    };
    statefulSets: { total: number; ready: number; degraded: number };
    daemonSets: { total: number; ready: number; degraded: number };
  };
  usage: {
    available: boolean;
    cpuMillis: number | null;
    memoryBytes: number | null;
    nodeCount: number;
  };
  namespaces: {
    total: number;
    items: Array<{ name: string; pods: number; ageSeconds: number | null; phase: string }>;
  };
  events: Array<{
    type: string;
    reason: string;
    message: string;
    kind: string;
    name: string;
    namespace: string;
    count: number;
    lastSeen: string;
    ageSeconds: number | null;
  }>;
  problems: Array<{
    kind: string;
    namespace: string;
    name: string;
    reason: string;
    phase: string;
    ready: boolean;
    restarts: number;
    ageSeconds: number | null;
    node: string | null;
  }>;
  warnings: string[];
  generatedAt: string;
}

export interface KubeEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  kind: string;
  name: string;
  namespace: string;
  component: string;
  host: string;
  firstSeen?: string;
  lastSeen?: string;
  ageSeconds: number | null;
  uid?: string;
  apiVersion?: string;
  fieldPath?: string;
}

export interface EventsResponse {
  cluster: string;
  namespace: string | null;
  items: KubeEvent[];
  total: number;
}

export interface AccessResponse {
  cluster: string;
  namespace: string;
  identity: {
    username?: string;
    uid?: string;
    groups?: string[];
    extra?: Record<string, string[]>;
  } | null;
  capabilities: Record<string, string[]>;
  allVerbs: string[];
  rules: Array<{
    verbs?: string[];
    apiGroups?: string[];
    resources?: string[];
    resourceNames?: string[];
  }>;
  incomplete: boolean;
  error: string | null;
  warnings: string[];
}

export interface ApiResourceInfo {
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

export interface SearchItem {
  kind: string;
  group: string;
  version: string;
  plural: string;
  namespace?: string;
  name: string;
  status?: string;
  score: number;
}

export interface SearchResponse {
  cluster: string;
  query: string;
  items: SearchItem[];
  truncated: boolean;
}

export interface MetricsResponse {
  cluster: string;
  available: boolean;
  reason?: string;
  nodes: Array<{ name: string; cpuMillis: number; memoryBytes: number }>;
  pods: Array<{
    namespace: string;
    name: string;
    cpuMillis: number;
    memoryBytes: number;
    containers: Array<{ name: string; cpuMillis: number; memoryBytes: number }>;
  }>;
  generatedAt?: string;
}
