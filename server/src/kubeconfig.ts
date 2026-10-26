import { readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

export interface ExecAuthConfig {
  apiVersion?: string;
  command: string;
  args?: string[];
  env?: Array<{ name: string; value: string }>;
  provideClusterInfo?: boolean;
  installHint?: string;
  interactiveMode?: string;
}

export type AuthSpec =
  | { kind: 'client-cert'; cert: Buffer; key: Buffer }
  | { kind: 'token'; token?: string; tokenFile?: string }
  | { kind: 'basic'; username: string; password: string }
  | { kind: 'exec'; exec: ExecAuthConfig }
  | { kind: 'none' };

export interface KubeContext {
  /** Stable identifier exposed through the API. */
  id: string;
  name: string;
  cluster: string;
  user: string;
  namespace: string;
  server: string;
  source: string;
  ca?: Buffer;
  insecureSkipTlsVerify: boolean;
  tlsServerName?: string;
  auth: AuthSpec;
  warnings: string[];
}

export interface KubeConfigSet {
  contexts: KubeContext[];
  currentContext?: string;
  warnings: string[];
  source: string;
}

interface RawCluster {
  name?: string;
  cluster?: {
    server?: string;
    'certificate-authority'?: string;
    'certificate-authority-data'?: string;
    'insecure-skip-tls-verify'?: boolean;
    'tls-server-name'?: string;
    'proxy-url'?: string;
  };
}

interface RawUser {
  name?: string;
  user?: {
    'client-certificate'?: string;
    'client-certificate-data'?: string;
    'client-key'?: string;
    'client-key-data'?: string;
    token?: string;
    tokenFile?: string;
    username?: string;
    password?: string;
    exec?: ExecAuthConfig;
    'auth-provider'?: { name?: string; config?: Record<string, string> };
  };
}

interface RawContext {
  name?: string;
  context?: { cluster?: string; user?: string; namespace?: string };
}

interface RawKubeconfig {
  clusters?: RawCluster[];
  users?: RawUser[];
  contexts?: RawContext[];
  'current-context'?: string;
}

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolvePath(baseDir: string, p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(baseDir, expandHome(p));
}

function decodeData(value: string | undefined): Buffer | undefined {
  if (!value) return undefined;
  const trimmed = value.replace(/\s+/g, '');
  try {
    return Buffer.from(trimmed, 'base64');
  } catch {
    return undefined;
  }
}

function relativeExists(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function splitKubeconfigPaths(raw: string): string[] {
  return raw
    .split(path.delimiter)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => resolvePath(process.cwd(), p));
}

function defaultKubeconfigPaths(): string[] {
  const candidates: string[] = [];
  if (process.env.KUBECONFIG) candidates.push(...splitKubeconfigPaths(process.env.KUBECONFIG));
  candidates.push(path.join(os.homedir(), '.kube', 'config'));
  return candidates.filter((p) => relativeExists(p));
}

function inClusterContext(): KubeContext | undefined {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT ?? '443';
  if (!host) return undefined;
  const saDir = '/var/run/secrets/kubernetes.io/serviceaccount';
  const tokenFile = path.join(saDir, 'token');
  const caFile = path.join(saDir, 'ca.crt');
  if (!relativeExists(tokenFile)) return undefined;
  let namespace = 'default';
  try {
    namespace = readFileSync(path.join(saDir, 'namespace'), 'utf8').trim() || 'default';
  } catch {
    /* keep default */
  }
  const hostPart = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const warnings: string[] = [];
  let ca: Buffer | undefined;
  if (relativeExists(caFile)) {
    ca = readFileSync(caFile);
  } else {
    warnings.push('Service account CA certificate not found; TLS verification may fail.');
  }
  return {
    id: 'in-cluster',
    name: 'in-cluster',
    cluster: 'in-cluster',
    user: 'service-account',
    namespace,
    server: `https://${hostPart}:${port}`,
    source: 'in-cluster',
    ca,
    insecureSkipTlsVerify: false,
    auth: { kind: 'token', tokenFile },
    warnings,
  };
}

export function loadKubeConfigs(rawPath?: string): KubeConfigSet {
  const warnings: string[] = [];
  const paths = rawPath ? splitKubeconfigPaths(rawPath) : defaultKubeconfigPaths();
  const existing = paths.filter((p) => relativeExists(p));

  if (rawPath && existing.length === 0) {
    warnings.push(`Kubeconfig not found at ${rawPath}. Showing the setup screen.`);
  }

  const clusters = new Map<string, { entry: RawCluster['cluster']; dir: string; source: string }>();
  const users = new Map<string, { entry: RawUser['user']; dir: string; source: string }>();
  const contexts = new Map<string, { entry: RawContext['context']; source: string }>();
  let currentContext: string | undefined;

  for (const file of existing) {
    let doc: RawKubeconfig;
    try {
      doc = parse(readFileSync(file, 'utf8')) as RawKubeconfig;
    } catch (error) {
      warnings.push(`Could not parse ${file}: ${(error as Error).message}`);
      continue;
    }
    if (!doc || typeof doc !== 'object') continue;
    const dir = path.dirname(file);
    for (const item of doc.clusters ?? []) {
      if (!item?.name || !item.cluster) continue;
      if (!clusters.has(item.name)) clusters.set(item.name, { entry: item.cluster, dir, source: file });
    }
    for (const item of doc.users ?? []) {
      if (!item?.name || !item.user) continue;
      if (!users.has(item.name)) users.set(item.name, { entry: item.user, dir, source: file });
    }
    for (const item of doc.contexts ?? []) {
      if (!item?.name || !item.context) continue;
      if (!contexts.has(item.name)) contexts.set(item.name, { entry: item.context, source: file });
    }
    if (!currentContext && doc['current-context']) currentContext = doc['current-context'];
  }

  const resolved: KubeContext[] = [];
  for (const [name, ctx] of contexts) {
    const ctxWarnings: string[] = [];
    const clusterName = ctx.entry?.cluster;
    const userName = ctx.entry?.user;
    if (!clusterName) {
      ctxWarnings.push(`Context "${name}" has no cluster.`);
      continue;
    }
    const clusterRef = clusters.get(clusterName);
    if (!clusterRef) {
      ctxWarnings.push(`Context "${name}" references unknown cluster "${clusterName}".`);
      continue;
    }
    const server = clusterRef.entry?.server;
    if (!server) {
      ctxWarnings.push(`Cluster "${clusterName}" has no server URL.`);
      continue;
    }

    let ca = decodeData(clusterRef.entry?.['certificate-authority-data']);
    if (!ca && clusterRef.entry?.['certificate-authority']) {
      const caPath = resolvePath(clusterRef.dir, clusterRef.entry['certificate-authority']);
      try {
        ca = readFileSync(caPath);
      } catch {
        ctxWarnings.push(`Cannot read certificate authority at ${caPath}.`);
      }
    }

    const userRef = userName ? users.get(userName) : undefined;
    if (userName && !userRef) {
      ctxWarnings.push(`Context "${name}" references unknown user "${userName}".`);
    }

    const auth = resolveAuth(userRef, ctxWarnings);
    const insecureSkipTlsVerify = Boolean(clusterRef.entry?.['insecure-skip-tls-verify']);
    if (clusterRef.entry?.['proxy-url']) {
      ctxWarnings.push('The kubeconfig proxy-url setting is not supported and will be ignored.');
    }

    resolved.push({
      id: name,
      name,
      cluster: clusterName,
      user: userName ?? '',
      namespace: ctx.entry?.namespace || 'default',
      server: server.replace(/\/+$/, ''),
      source: ctx.source,
      ca,
      insecureSkipTlsVerify,
      tlsServerName: clusterRef.entry?.['tls-server-name'],
      auth,
      warnings: ctxWarnings,
    });
  }

  const inCluster = inClusterContext();
  if (inCluster && !resolved.some((c) => c.id === inCluster.id)) {
    resolved.unshift(inCluster);
  }

  if (resolved.length === 0 && warnings.length === 0) {
    warnings.push('No Kubernetes contexts found. Mount a kubeconfig or run inside a cluster.');
  }

  if (currentContext && !resolved.some((c) => c.id === currentContext)) {
    currentContext = undefined;
  }

  return {
    contexts: resolved,
    currentContext: currentContext ?? resolved[0]?.id,
    warnings,
    source: existing.join(path.delimiter),
  };
}

function resolveAuth(
  userRef: { entry: RawUser['user']; dir: string; source: string } | undefined,
  warnings: string[],
): AuthSpec {
  const user = userRef?.entry;
  if (!user) return { kind: 'none' };

  if (user.exec?.command) {
    return {
      kind: 'exec',
      exec: {
        apiVersion: user.exec.apiVersion,
        command: user.exec.command,
        args: user.exec.args,
        env: user.exec.env,
        provideClusterInfo: user.exec.provideClusterInfo,
        installHint: user.exec.installHint,
        interactiveMode: user.exec.interactiveMode,
      },
    };
  }

  if (user.token || user.tokenFile) {
    let tokenFile: string | undefined;
    if (user.tokenFile) {
      tokenFile = resolvePath(userRef.dir, user.tokenFile);
      if (!relativeExists(tokenFile)) {
        warnings.push(`Token file not found: ${tokenFile}`);
        tokenFile = undefined;
      }
    }
    return { kind: 'token', token: user.token, tokenFile };
  }

  let cert = decodeData(user['client-certificate-data']);
  let key = decodeData(user['client-key-data']);
  if (!cert && user['client-certificate']) {
    const p = resolvePath(userRef.dir, user['client-certificate']);
    try {
      cert = readFileSync(p);
    } catch {
      warnings.push(`Cannot read client certificate at ${p}.`);
    }
  }
  if (!key && user['client-key']) {
    const p = resolvePath(userRef.dir, user['client-key']);
    try {
      key = readFileSync(p);
    } catch {
      warnings.push(`Cannot read client key at ${p}.`);
    }
  }
  if (cert && key) return { kind: 'client-cert', cert, key };

  if (user.username) {
    return { kind: 'basic', username: user.username, password: user.password ?? '' };
  }

  if (user['auth-provider']?.name) {
    warnings.push(
      `User relies on the legacy auth-provider "${user['auth-provider'].name}", which is not supported. Use an exec credential plugin instead.`,
    );
  }
  return { kind: 'none' };
}

export function contextById(set: KubeConfigSet, id?: string): KubeContext | undefined {
  if (!id) return set.contexts.find((c) => c.id === set.currentContext) ?? set.contexts[0];
  return set.contexts.find((c) => c.id === id);
}
