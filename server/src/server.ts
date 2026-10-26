import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import { createRouter } from './api/index.js';
import { ExecBridge } from './api/exec.js';
import { HttpError, KubeError } from './errors.js';
import { log } from './logger.js';
import type { AppState } from './state.js';
import { StaticServer } from './http/static.js';
import {
  readJson,
  sendError,
  sendJson,
  type RequestContext,
  type RouteResult,
} from './http/context.js';

const AUTH_COOKIE = 'ki_auth';

export function createApp(state: AppState): http.Server {
  const router = createRouter();
  const staticServer = new StaticServer(state.config.webDir);
  const execBridge = new ExecBridge(state);
  const authToken = state.config.authToken;

  const server = http.createServer(async (req, res) => {
    const started = process.hrtime.bigint();
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    setSecurityHeaders(res, Boolean(authToken));

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      log.info('request', {
        method: req.method,
        path: url.pathname,
        status: res.statusCode,
        ms: Math.round(ms * 10) / 10,
      });
    });

    try {
      if (url.pathname === '/healthz' || url.pathname === '/api/healthz') {
        sendJson(res, 200, { status: 'ok', uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000) });
        return;
      }

      if (url.pathname === '/api/login') {
        await handleLogin(req, res, state);
        return;
      }

      if (url.pathname === '/api/logout') {
        res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        if (!isAuthorized(req, authToken)) {
          sendError(res, 401, 'Authentication required', 'AUTH_REQUIRED');
          return;
        }
        if (!isSameOrigin(req)) {
          sendError(res, 403, 'Cross-origin request rejected');
          return;
        }
        const handler = router.match(req.method ?? 'GET', url.pathname);
        if (!handler) {
          sendError(res, 404, `Unknown API endpoint: ${req.method} ${url.pathname}`, 'NOT_FOUND');
          return;
        }
        const ctx = createContext(state, req, res, url);
        const result = await handler(ctx);
        if (result) writeResult(res, result);
        else if (!res.headersSent && !res.writableEnded) {
          sendJson(res, 204, undefined);
        }
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendError(res, 405, 'Method not allowed');
        return;
      }

      const served = await staticServer.handle(req, res, url);
      if (!served) {
        if (existsSync(state.config.webDir)) {
          sendError(res, 404, 'Not found');
        } else {
          sendSetupPage(res, state);
        }
      }
    } catch (error) {
      handleError(res, error);
    }
  });

  server.on('upgrade', (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== '/api/exec') {
      socket.destroy();
      return;
    }
    if (!isAuthorized(req, authToken)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!isSameOrigin(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    execBridge.handleUpgrade(req, socket, head);
  });

  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  server.on('listening', () => {
    const address = server.address();
    const where = typeof address === 'object' && address ? `${address.address}:${address.port}` : String(address);
    log.info(`KubeInsight ${state.config.version} listening on http://${where}`);
    log.info(`Loaded ${state.contexts.length} context(s)`, {
      contexts: state.contexts.map((c) => c.id).join(', ') || 'none',
    });
    if (!authToken && state.config.host !== '127.0.0.1' && state.config.host !== 'localhost' && state.config.host !== '::1') {
      log.warn('KubeInsight is reachable from the network without authentication. Set KUBEINSIGHT_AUTH_TOKEN or keep --host 127.0.0.1.');
    }
    for (const warning of state.kube.warnings) log.warn(warning);
    if (!existsSync(state.config.webDir)) {
      log.warn('Web UI build not found', { webDir: state.config.webDir });
    }
  });

  return server;
}

function createContext(
  state: AppState,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): RequestContext {
  return {
    req,
    res,
    url,
    query: url.searchParams,
    state,
    readJson: <T>() => readJson<T>(req),
    readText: async (limit?: number) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString('utf8').slice(0, limit ?? 8 * 1024 * 1024);
    },
  };
}

function writeResult(res: http.ServerResponse, result: RouteResult): void {
  if (res.writableEnded) return;
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  }
  if (result.body === undefined) {
    res.writeHead(result.status ?? 204);
    res.end();
    return;
  }
  sendJson(res, result.status ?? 200, result.body);
}

function handleError(res: http.ServerResponse, error: unknown): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  if (error instanceof HttpError) {
    sendError(res, error.status, error.message, error.code);
    return;
  }
  if (error instanceof KubeError) {
    const status = error.status >= 400 && error.status < 600 ? error.status : 502;
    sendError(res, status, error.message, error.reason);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  log.error('Unhandled request error', { error: message });
  sendError(res, 500, message);
}

async function handleLogin(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: AppState,
): Promise<void> {
  if (!state.config.authToken) {
    sendError(res, 400, 'Authentication is not enabled');
    return;
  }
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }
  let token = '';
  try {
    const body = await readJson<{ token?: string }>(req, 16 * 1024);
    token = typeof body.token === 'string' ? body.token : '';
  } catch {
    sendError(res, 400, 'Invalid request body');
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (!safeEqual(token, state.config.authToken)) {
    sendError(res, 401, 'Invalid access token');
    return;
  }
  const secure =
    Boolean((req.socket as { encrypted?: boolean }).encrypted) ||
    String(req.headers['x-forwarded-proto'] ?? '') === 'https';
  const cookie = `${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', cookie);
  sendJson(res, 200, { ok: true });
}

function isAuthorized(req: http.IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    if (safeEqual(header.slice(7), token)) return true;
  }
  const cookies = parseCookies(req.headers.cookie);
  const cookie = cookies[AUTH_COOKIE];
  if (cookie) {
    let decoded = cookie;
    try {
      decoded = decodeURIComponent(cookie);
    } catch {
      /* malformed cookie */
    }
    if (safeEqual(decoded, token)) return true;
  }
  return false;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isSameOrigin(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host === req.headers.host;
  } catch {
    return false;
  }
}

function setSecurityHeaders(res: http.ServerResponse, authEnabled: boolean): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  if (authEnabled) res.setHeader('Cache-Control', 'no-store');
}

function sendSetupPage(res: http.ServerResponse, state: AppState): void {
  const contexts = state.contexts.map((c) => `<li><code>${escapeHtml(c.id)}</code> — ${escapeHtml(c.server)}</li>`).join('');
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KubeInsight — setup</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0d12;color:#e6edf7;font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  main{max-width:680px;padding:40px;border:1px solid #232b3a;border-radius:14px;background:#11151f}
  h1{font-size:20px;margin:0 0 8px} p{color:#9aa8bd} code{background:#0b0f16;border:1px solid #232b3a;padding:2px 6px;border-radius:5px;font-family:ui-monospace,monospace}
  ul{padding-left:20px} .hint{color:#5eead4}
</style></head>
<body><main>
  <h1>KubeInsight 已启动</h1>
  ${contexts ? `<p>已加载的集群上下文：</p><ul>${contexts}</ul>` : '<p>当前没有可用的 Kubernetes 上下文。</p>'}
  <p>Web UI 尚未构建。开发时请访问 <code>http://localhost:5173</code>，或先运行：</p>
  <p><code>npm run build</code></p>
  <p>生产运行时，确保 <code>--web-dir</code> 指向构建产物（默认 <code>dist/public</code>）。</p>
  <p class="hint">API 健康检查：<code>/healthz</code></p>
</main></body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
