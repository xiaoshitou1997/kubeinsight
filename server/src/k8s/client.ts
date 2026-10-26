import http from 'node:http';
import https from 'node:https';
import type { KubeContext } from '../kubeconfig.js';
import { KubeError } from '../errors.js';
import { CredentialProvider } from './auth.js';

export interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  contentType?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface KubeResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

const MAX_BODY = 64 * 1024 * 1024;

export class KubeClient {
  private readonly credentials: CredentialProvider;

  constructor(
    public readonly ctx: KubeContext,
    private readonly defaultTimeoutMs = 30_000,
  ) {
    this.credentials = new CredentialProvider(ctx);
  }

  buildUrl(path: string, query?: RequestOptions['query']): URL {
    if (!path.startsWith('/')) throw new Error(`Kubernetes API path must start with "/": ${path}`);
    const url = new URL(this.ctx.server);
    const basePath = url.pathname.replace(/\/+$/, '');
    url.pathname = `${basePath}${path}`;
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  private async send(
    path: string,
    options: RequestOptions,
    stream: boolean,
  ): Promise<{ response: http.IncomingMessage; status: number }> {
    const url = this.buildUrl(path, options.query);
    const isHttps = url.protocol === 'https:';

    for (let attempt = 0; attempt < 2; attempt++) {
      const credential = await this.credentials.get();
      const headers: http.OutgoingHttpHeaders = {
        ...credential.headers,
        ...(options.headers ?? {}),
      };
      let payload: Buffer | undefined;
      if (options.body !== undefined) {
        if (Buffer.isBuffer(options.body)) {
          payload = options.body;
        } else if (typeof options.body === 'string') {
          payload = Buffer.from(options.body);
        } else {
          payload = Buffer.from(JSON.stringify(options.body));
        }
        headers['Content-Type'] = options.contentType ?? 'application/json';
        headers['Content-Length'] = String(payload.length);
      }

      try {
        const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
          const request = (isHttps ? https : http).request(
            url,
            {
              method: options.method ?? 'GET',
              headers,
              agent: isHttps ? credential.agent : undefined,
              signal: options.signal,
            },
            resolve,
          );
          request.on('error', reject);
          if (stream) {
            request.setTimeout(0);
          } else {
            request.setTimeout(options.timeoutMs ?? this.defaultTimeoutMs, () => {
              request.destroy(new Error('Kubernetes API request timed out'));
            });
          }
          if (payload) request.write(payload);
          request.end();
        });

        const status = response.statusCode ?? 0;
        if (status === 401 && attempt === 0 && this.credentials.refreshable) {
          response.resume();
          this.credentials.refresh();
          continue;
        }
        return { response, status };
      } catch (error) {
        if (attempt === 0 && this.credentials.refreshable && isRetryableNetworkError(error)) {
          this.credentials.refresh();
          continue;
        }
        throw new KubeError(502, `Cannot reach Kubernetes API at ${this.ctx.server}: ${(error as Error).message}`);
      }
    }
    throw new KubeError(502, 'Kubernetes API authentication failed after refreshing credentials.');
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const { response, status } = await this.send(path, options, false);
    const body = await readBody(response);
    if (status < 200 || status >= 300) throw toKubeError(status, body, path);
    if (body.length === 0) return undefined as T;
    const text = body.toString('utf8');
    const contentType = String(response.headers['content-type'] ?? '');
    if (contentType.includes('json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as T;
      }
    }
    return text as T;
  }

  async stream(path: string, options: RequestOptions = {}): Promise<{ response: http.IncomingMessage; status: number }> {
    const { response, status } = await this.send(path, options, true);
    if (status < 200 || status >= 300) {
      const body = await readBody(response);
      throw toKubeError(status, body, path);
    }
    return { response, status };
  }

  async agentHeaders(): Promise<Record<string, string>> {
    const credential = await this.credentials.get();
    return credential.headers;
  }

  async agent(): Promise<https.Agent> {
    const credential = await this.credentials.get();
    return credential.agent;
  }
}

function readBody(response: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        response.destroy(new Error('Kubernetes API response too large'));
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', () => resolve(Buffer.concat(chunks)));
    response.on('error', reject);
  });
}

function toKubeError(status: number, body: Buffer, apiPath: string): KubeError {
  let message = `Kubernetes API request failed with HTTP ${status}`;
  let reason: string | undefined;
  let details: unknown;
  try {
    const parsed = JSON.parse(body.toString('utf8')) as {
      message?: string;
      reason?: string;
      details?: unknown;
    };
    if (parsed.message) message = parsed.message;
    reason = parsed.reason;
    details = parsed.details;
  } catch {
    if (body.length > 0 && body.length < 2000) {
      message = body.toString('utf8');
    }
  }
  if (!message) message = `Kubernetes API request failed: ${apiPath}`;
  return new KubeError(status, message, reason, details);
}

function isRetryableNetworkError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === 'ECONNRESET' || code === 'EPIPE';
}
