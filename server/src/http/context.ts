import type http from 'node:http';
import type { AppState } from '../state.js';
import { HttpError } from '../errors.js';

export interface RequestContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  query: URLSearchParams;
  state: AppState;
  readJson<T = unknown>(): Promise<T>;
  readText(limit?: number): Promise<string>;
}

export interface RouteResult {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type Handler = (ctx: RequestContext) => Promise<RouteResult | void>;

export function queryString(ctx: RequestContext, name: string): string | undefined {
  const value = ctx.query.get(name);
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function queryInt(
  ctx: RequestContext,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = queryString(ctx, name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function queryBool(ctx: RequestContext, name: string): boolean {
  const value = queryString(ctx, name);
  return value === '1' || value === 'true' || value === 'yes';
}

export function requireQuery(ctx: RequestContext, name: string): string {
  const value = queryString(ctx, name);
  if (!value) throw new HttpError(400, `Missing required query parameter: ${name}`);
  return value;
}

export async function readBody(req: http.IncomingMessage, limit = 8 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, `Request body exceeds ${Math.round(limit / 1024 / 1024)} MB`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson<T>(req: http.IncomingMessage, limit?: number): Promise<T> {
  const body = await readBody(req, limit);
  if (body.length === 0) return {} as T;
  try {
    return JSON.parse(body.toString('utf8')) as T;
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON');
  }
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(payload.length),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

export function sendError(res: http.ServerResponse, status: number, message: string, code?: string): void {
  sendJson(res, status, { error: { message, code, status } });
}
