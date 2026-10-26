import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import type { KubeContext } from '../kubeconfig.js';
import { HttpError } from '../errors.js';

interface ExecCredential {
  token?: string;
  cert?: Buffer;
  key?: Buffer;
  expiresAt?: number;
}

interface Credential {
  headers: Record<string, string>;
  agent: https.Agent;
}

/**
 * Resolves and caches authentication for a single context.
 * Supported: client certificates, bearer tokens, token files, basic auth and
 * client-go style exec credential plugins (EKS, GKE, AKS, ...).
 */
export class CredentialProvider {
  private execCache?: ExecCredential;
  private execInFlight?: Promise<ExecCredential>;
  private tokenCache?: { token: string; readAt: number };
  private tokenInFlight?: Promise<string | undefined>;
  private readonly agentCache = new Map<string, https.Agent>();

  constructor(private readonly ctx: KubeContext) {}

  get refreshable(): boolean {
    return this.ctx.auth.kind === 'exec';
  }

  refresh(): void {
    this.execCache = undefined;
  }

  async get(): Promise<Credential> {
    switch (this.ctx.auth.kind) {
      case 'client-cert':
        return this.makeCredential(this.ctx.auth.cert, this.ctx.auth.key);
      case 'token': {
        const token = await this.resolveToken();
        return this.makeCredential(undefined, undefined, token ? { Authorization: `Bearer ${token}` } : {});
      }
      case 'basic': {
        const encoded = Buffer.from(`${this.ctx.auth.username}:${this.ctx.auth.password}`).toString('base64');
        return this.makeCredential(undefined, undefined, { Authorization: `Basic ${encoded}` });
      }
      case 'exec': {
        const creds = await this.resolveExec();
        return this.makeCredential(creds.cert, creds.key, creds.token ? { Authorization: `Bearer ${creds.token}` } : {});
      }
      default:
        return this.makeCredential();
    }
  }

  private agent(cert?: Buffer, key?: Buffer): https.Agent {
    const hash = createHash('sha256')
      .update(cert ?? '')
      .update(key ?? '')
      .digest('hex')
      .slice(0, 16);
    const cached = this.agentCache.get(hash);
    if (cached) return cached;
    const agent = new https.Agent({
      keepAlive: true,
      maxSockets: 32,
      maxFreeSockets: 8,
      ca: this.ctx.ca,
      cert,
      key,
      rejectUnauthorized: !this.ctx.insecureSkipTlsVerify,
      servername: this.ctx.tlsServerName,
    });
    this.agentCache.set(hash, agent);
    return agent;
  }

  private makeCredential(
    cert?: Buffer,
    key?: Buffer,
    headers: Record<string, string> = {},
  ): Credential {
    return {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'kubeinsight/0.1.0',
        ...headers,
      },
      agent: this.agent(cert, key),
    };
  }

  private async resolveToken(): Promise<string | undefined> {
    const auth = this.ctx.auth;
    if (auth.kind !== 'token') return undefined;
    if (auth.token) return auth.token;
    if (!auth.tokenFile) return undefined;

    const now = Date.now();
    if (this.tokenCache && now - this.tokenCache.readAt < 60_000) return this.tokenCache.token;
    if (this.tokenInFlight) return this.tokenInFlight;

    this.tokenInFlight = Promise.resolve().then(() => {
      try {
        const token = readFileSync(auth.tokenFile!, 'utf8').trim();
        this.tokenCache = { token, readAt: Date.now() };
        return token;
      } catch (error) {
        throw new HttpError(500, `Cannot read token file ${auth.tokenFile}: ${(error as Error).message}`);
      } finally {
        this.tokenInFlight = undefined;
      }
    });
    return this.tokenInFlight;
  }

  private async resolveExec(): Promise<ExecCredential> {
    if (this.execCache) {
      if (!this.execCache.expiresAt || this.execCache.expiresAt - Date.now() > 30_000) {
        return this.execCache;
      }
      this.execCache = undefined;
    }
    if (this.execInFlight) return this.execInFlight;

    this.execInFlight = Promise.resolve().then(() => {
      try {
        const creds = runExecPlugin(this.ctx);
        this.execCache = creds;
        return creds;
      } finally {
        this.execInFlight = undefined;
      }
    });
    return this.execInFlight;
  }
}

function runExecPlugin(ctx: KubeContext): ExecCredential {
  if (ctx.auth.kind !== 'exec') throw new Error('Not an exec context');
  const config = ctx.auth.exec;

  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const item of config.env ?? []) env[item.name] = item.value;

  const cluster: Record<string, unknown> = { server: ctx.server };
  if (ctx.ca) cluster['certificate-authority-data'] = ctx.ca.toString('base64');
  if (ctx.insecureSkipTlsVerify) cluster['insecure-skip-tls-verify'] = true;

  const execInfo = {
    apiVersion: config.apiVersion ?? 'client.authentication.k8s.io/v1beta1',
    kind: 'ExecCredential',
    spec: {
      interactive: false,
      ...(config.provideClusterInfo ? { cluster } : {}),
    },
  };
  env.KUBERNETES_EXEC_INFO = JSON.stringify(execInfo);

  let stdout: string;
  try {
    stdout = execFileSync(config.command, config.args ?? [], {
      env,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: Buffer | string; status?: number };
    const stderr = err.stderr ? String(err.stderr).trim().slice(0, 800) : '';
    const hint = config.installHint ? ` ${config.installHint}` : '';
    const detail = stderr || err.message;
    throw new HttpError(
      502,
      `Exec credential plugin "${config.command}" failed${err.status ? ` (exit ${err.status})` : ''}: ${detail}.${hint}`,
    );
  }

  let parsed: {
    status?: {
      token?: string;
      clientCertificateData?: string;
      clientKeyData?: string;
      expirationTimestamp?: string;
    };
  };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new HttpError(502, `Exec credential plugin "${config.command}" returned invalid JSON.`);
  }

  const status = parsed.status;
  if (!status?.token && !(status?.clientCertificateData && status?.clientKeyData)) {
    throw new HttpError(502, `Exec credential plugin "${config.command}" returned no credentials.`);
  }

  return {
    token: status.token,
    cert: status.clientCertificateData ? Buffer.from(status.clientCertificateData) : undefined,
    key: status.clientKeyData ? Buffer.from(status.clientKeyData) : undefined,
    expiresAt: status.expirationTimestamp ? Date.parse(status.expirationTimestamp) : undefined,
  };
}
