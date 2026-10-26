import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const TEXT_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);

interface CompressedEntry {
  mtimeMs: number;
  size: number;
  data: Buffer;
}

export class StaticServer {
  private readonly gzipCache = new Map<string, CompressedEntry>();
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<boolean> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    const requested = decodeURIComponent(url.pathname);
    let relative = requested.replace(/^\/+/, '');
    let filePath = path.resolve(this.root, relative);

    if (!filePath.startsWith(this.root)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return true;
    }

    let info = await stat(filePath).catch(() => undefined);
    if (info?.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      info = await stat(filePath).catch(() => undefined);
    }
    if (!info?.isFile()) {
      if (requested !== '/index.html' && !this.wantsHtml(req)) return false;
      filePath = path.join(this.root, 'index.html');
      info = await stat(filePath).catch(() => undefined);
      if (!info?.isFile()) return false;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    const isAsset = filePath.includes(`${path.sep}assets${path.sep}`);
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    };

    const acceptsGzip = String(req.headers['accept-encoding'] ?? '').includes('gzip');
    if (acceptsGzip && TEXT_EXTENSIONS.has(ext) && info.size > 1024) {
      const cached = await this.compressed(filePath, info.mtimeMs, info.size);
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = String(cached.length);
      headers.Vary = 'Accept-Encoding';
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : cached);
      return true;
    }

    headers['Content-Length'] = String(info.size);
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!res.writableEnded) res.destroy();
    });
    stream.pipe(res);
    return true;
  }

  private wantsHtml(req: http.IncomingMessage): boolean {
    const accept = String(req.headers.accept ?? '');
    return accept === '' || accept.includes('text/html') || accept.includes('*/*');
  }

  private async compressed(filePath: string, mtimeMs: number, size: number): Promise<Buffer> {
    const cached = this.gzipCache.get(filePath);
    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached.data;
    const raw = await readFile(filePath);
    const data = gzipSync(raw, { level: 9 });
    if (this.gzipCache.size > 100) this.gzipCache.clear();
    this.gzipCache.set(filePath, { mtimeMs, size, data });
    return data;
  }
}
