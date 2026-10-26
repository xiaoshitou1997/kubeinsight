import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { URL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type { AppState } from '../state.js';
import { log } from '../logger.js';
import { assertSegment } from '../k8s/urls.js';

interface ClientMessage {
  t?: string;
  d?: string;
  cols?: number;
  rows?: number;
}

/**
 * Bridges browser WebSockets to the Kubernetes exec endpoint using the
 * v4.channel.k8s.io WebSocket protocol (Kubernetes >= 1.21).
 */
export class ExecBridge {
  private readonly wss: WebSocketServer;

  constructor(private readonly state: AppState) {
    this.wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.handleConnection(ws, req).catch((error) => {
        log.error('Exec setup failed', { error: (error as Error).message });
        try {
          ws.send(JSON.stringify({ t: 'error', message: (error as Error).message }));
        } catch {
          /* ignore */
        }
        ws.close();
      });
    });
  }

  private async handleConnection(browser: WebSocket, req: IncomingMessage): Promise<void> {
    if (!this.state.config.allowExec) {
      browser.close(1011, 'Pod exec is disabled');
      return;
    }
    if (this.state.config.readOnly) {
      browser.close(1011, 'Pod exec is disabled in read-only mode');
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const clusterId = url.searchParams.get('cluster') ?? undefined;
    const namespace = url.searchParams.get('namespace');
    const pod = url.searchParams.get('pod');
    const container = url.searchParams.get('container') ?? undefined;
    const tty = url.searchParams.get('tty') !== 'false';
    const commandArgs = url.searchParams.getAll('command');
    const command = commandArgs.length > 0 ? commandArgs : ['/bin/sh'];

    if (!namespace || !pod) {
      browser.close(1008, 'namespace and pod are required');
      return;
    }
    if (command.length > 8 || command.some((part) => part.length > 512 || part.includes('\0'))) {
      browser.close(1008, 'Invalid command');
      return;
    }
    assertSegment(namespace, 'namespace');
    assertSegment(pod, 'pod');

    const client = this.state.client(clusterId);
    const headers = await client.agentHeaders();
    const agent = await client.agent();
    // The exec endpoint is negotiated through the WebSocket subprotocol and
    // rejects requests that advertise an Accept type.
    delete headers.Accept;

    const path = `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}/exec`;
    const upstreamUrl = client.buildUrl(path);
    const query = upstreamUrl.searchParams;
    for (const arg of command) query.append('command', arg);
    query.set('stdin', 'true');
    query.set('stdout', 'true');
    query.set('stderr', 'true');
    query.set('tty', String(tty));
    if (container) query.set('container', container);

    const upstream = new WebSocket(upstreamUrl, ['v4.channel.k8s.io'], {
      headers,
      agent,
      perMessageDeflate: false,
      handshakeTimeout: 15_000,
      followRedirects: true,
      maxPayload: 1024 * 1024,
    });

    let closed = false;
    const closeBoth = (code = 1000, reason = '') => {
      if (closed) return;
      closed = true;
      try {
        if (browser.readyState === WebSocket.OPEN) browser.close(code, reason);
      } catch {
        /* ignore */
      }
      try {
        upstream.terminate();
      } catch {
        /* ignore */
      }
    };

    upstream.on('open', () => {
      log.debug('Exec session opened', { cluster: clusterId, namespace, pod });
    });

    upstream.on('message', (raw) => {
      const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
      if (buffer.length === 0) return;
      const channel = buffer[0];
      const payload = buffer.subarray(1);
      if (browser.readyState !== WebSocket.OPEN) return;

      if (channel === 1 || channel === 2) {
        browser.send(
          JSON.stringify({ t: channel === 1 ? 'stdout' : 'stderr', d: payload.toString('utf8') }),
        );
      } else if (channel === 3) {
        const text = payload.toString('utf8');
        let message = text;
        try {
          const status = JSON.parse(text) as { status?: string; message?: string; reason?: string };
          if (status.status === 'Success') {
            closeBoth(1000, 'Session ended');
            return;
          }
          message = status.message || status.reason || text;
        } catch {
          /* plain text error */
        }
        if (browser.readyState === WebSocket.OPEN) {
          browser.send(JSON.stringify({ t: 'error', message }));
        }
        closeBoth(1000, message.slice(0, 100));
      }
    });

    upstream.on('unexpected-response', (_request, response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        let message = `Kubernetes exec failed with HTTP ${response.statusCode}`;
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          /* ignore */
        }
        if (browser.readyState === WebSocket.OPEN) {
          browser.send(JSON.stringify({ t: 'error', message }));
        }
        closeBoth(1011, 'exec failed');
      });
    });

    upstream.on('error', (error) => {
      log.warn('Exec upstream error', { error: error.message });
      if (browser.readyState === WebSocket.OPEN) {
        browser.send(JSON.stringify({ t: 'error', message: error.message }));
      }
      closeBoth(1011, 'upstream error');
    });

    upstream.on('close', (code, reason) => {
      if (!closed) {
        closed = true;
        if (browser.readyState === WebSocket.OPEN) {
          browser.close(code === 1000 ? 1000 : 1011, reason?.toString().slice(0, 100) || 'exec closed');
        }
      }
    });

    browser.on('message', (raw) => {
      if (upstream.readyState !== WebSocket.OPEN) return;
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }
      if (message.t === 'input' && typeof message.d === 'string') {
        upstream.send(Buffer.concat([Buffer.from([0]), Buffer.from(message.d, 'utf8')]));
      } else if (message.t === 'resize' && tty) {
        const cols = Math.max(2, Math.min(500, Number(message.cols) || 80));
        const rows = Math.max(2, Math.min(500, Number(message.rows) || 24));
        upstream.send(
          Buffer.concat([
            Buffer.from([4]),
            Buffer.from(JSON.stringify({ Width: Math.round(cols), Height: Math.round(rows) })),
          ]),
        );
      }
    });

    browser.on('close', () => closeBoth());
    browser.on('error', () => closeBoth());
  }
}
