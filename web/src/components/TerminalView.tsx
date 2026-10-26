import '@xterm/xterm/css/xterm.css';
import type { FitAddon as FitAddonInstance } from '@xterm/addon-fit';
import type { Terminal as XTermInstance } from '@xterm/xterm';
import { CircleAlert, RotateCw, Trash2, Unplug } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { tr } from '../i18n';
import { classNames } from '../lib/format';
import { Badge, IconButton } from './ui';

type TerminalStatus = 'connecting' | 'connected' | 'closed' | 'error';

export function TerminalView({
  namespace,
  pod,
  containers,
  disabledReason,
}: {
  namespace: string;
  pod: string;
  containers: string[];
  disabledReason?: string;
}) {
  const { cluster } = useApp();
  const [container, setContainer] = useState(containers[0] ?? '');
  const [shell, setShell] = useState('/bin/sh');
  const [status, setStatus] = useState<TerminalStatus>('connecting');
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTermInstance | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containers.includes(container)) setContainer(containers[0] ?? '');
  }, [containers, container]);

  useEffect(() => {
    if (disabledReason) return;
    let disposed = false;
    let term: XTermInstance | null = null;
    let fit: FitAddonInstance | null = null;
    let socket: WebSocket | null = null;
    let observer: ResizeObserver | null = null;

    setStatus('connecting');
    setError('');

    const start = async () => {
      const host = hostRef.current;
      if (!host) return;
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (disposed) return;

      term = new Terminal({
        cursorBlink: true,
        fontSize: 12.5,
        fontFamily:
          '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        lineHeight: 1.25,
        scrollback: 5000,
        allowTransparency: true,
        theme: {
          background: '#0a0e15',
          foreground: '#d8e2f0',
          cursor: '#5eead4',
          cursorAccent: '#0a0e15',
          selectionBackground: 'rgba(94, 234, 212, 0.22)',
          black: '#0a0e15',
          red: '#fb7185',
          green: '#34d399',
          yellow: '#fbbf24',
          blue: '#60a5fa',
          magenta: '#c084fc',
          cyan: '#5eead4',
          white: '#e2e8f0',
          brightBlack: '#64748b',
          brightRed: '#fda4af',
          brightGreen: '#6ee7b7',
          brightYellow: '#fde68a',
          brightBlue: '#93c5fd',
          brightMagenta: '#d8b4fe',
          brightCyan: '#99f6e4',
          brightWhite: '#f8fafc',
        },
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      termRef.current = term;

      const safeFit = () => {
        try {
          if (host.clientWidth > 0 && host.clientHeight > 0) fit?.fit();
        } catch {
          /* ignore */
        }
      };
      window.setTimeout(safeFit, 30);

      term.writeln(`\x1b[38;2;94;234;212m●\x1b[0m ${tr('正在连接容器终端…')}`);
      term.writeln('\x1b[38;2;100;116;139m  ' + namespace + '/' + pod + ' · ' + container + '\x1b[0m');
      term.writeln('');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({
        cluster,
        namespace,
        pod,
        container,
        tty: 'true',
      });
      params.append('command', shell);
      socket = new WebSocket(`${protocol}//${window.location.host}/api/exec?${params.toString()}`);
      wsRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        setStatus('connected');
        safeFit();
        if (term) {
          socket?.send(
            JSON.stringify({ t: 'resize', cols: term.cols, rows: term.rows }),
          );
        }
        term?.focus();
      };

      socket.onmessage = (event) => {
        let message: { t?: string; d?: string; message?: string };
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.t === 'stdout' || message.t === 'stderr') {
          term?.write(message.d ?? '');
        } else if (message.t === 'error') {
          setError(message.message ?? tr('终端错误'));
          setStatus('error');
          term?.writeln(`\r\n\x1b[38;2;251;113;133m${message.message ?? tr('终端错误')}\x1b[0m`);
        }
      };

      socket.onerror = () => {
        if (disposed) return;
        setStatus('error');
        setError(tr('WebSocket 连接失败'));
      };

      socket.onclose = (event) => {
        if (disposed) return;
        setStatus((current) => (current === 'error' ? 'error' : 'closed'));
        if (event.code !== 1000) {
          term?.writeln(
            `\r\n\x1b[38;2;100;116;139m[${tr('连接已关闭')} code=${event.code}]\x1b[0m`,
          );
        }
      };

      term.onData((data) => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ t: 'input', d: data }));
        }
      });

      term.onResize(({ cols, rows }) => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ t: 'resize', cols, rows }));
        }
      });

      observer = new ResizeObserver(() => safeFit());
      observer.observe(host);
    };

    void start();

    return () => {
      disposed = true;
      observer?.disconnect();
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000, 'tab closed');
      term?.dispose();
      termRef.current = null;
      wsRef.current = null;
    };
  }, [cluster, namespace, pod, container, shell, disabledReason, nonce]);

  const disconnect = () => {
    wsRef.current?.close(1000, 'user');
    setStatus('closed');
  };

  if (disabledReason) {
    return (
      <div className="terminal-disabled">
        <CircleAlert size={18} />
        <div>
          <strong>{tr('终端不可用')}</strong>
          <p>{disabledReason}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-view">
      <div className="terminal-toolbar">
        {containers.length > 1 ? (
          <select
            className="select select-sm"
            value={container}
            onChange={(event) => setContainer(event.target.value)}
            aria-label={tr('选择容器')}
          >
            {containers.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        ) : (
          <span className="terminal-container">{container || 'default'}</span>
        )}
        <select
          className="select select-sm"
          value={shell}
          onChange={(event) => setShell(event.target.value)}
          aria-label={tr('选择 Shell')}
        >
          <option value="/bin/sh">/bin/sh</option>
          <option value="/bin/bash">/bin/bash</option>
          <option value="/bin/ash">/bin/ash</option>
          <option value="/bin/zsh">/bin/zsh</option>
        </select>
        <Badge
          tone={
            status === 'connected' ? 'ok' : status === 'connecting' ? 'warn' : status === 'error' ? 'err' : 'muted'
          }
          pulse={status === 'connecting'}
        >
          {status === 'connected'
            ? tr('已连接')
            : status === 'connecting'
              ? tr('连接中')
              : status === 'error'
                ? tr('连接错误')
                : tr('已断开')}
        </Badge>
        <div className="terminal-spacer" />
        {error && <span className="terminal-error">{error}</span>}
        <IconButton icon={RotateCw} label={tr('重新连接')} onClick={() => setNonce((value) => value + 1)} />
        <IconButton
          icon={Trash2}
          label={tr('清屏')}
          onClick={() => {
            termRef.current?.clear();
            termRef.current?.focus();
          }}
        />
        <IconButton icon={Unplug} label={tr('断开连接')} onClick={disconnect} />
      </div>
      <div className={classNames('terminal-host', status === 'error' && 'has-error')} ref={hostRef} />
      <div className="terminal-hint">
        {tr('终端通过 Kubernetes exec API 建立，命令以当前 kubeconfig 身份执行。调整窗口大小会自动同步终端尺寸。')}
      </div>
    </div>
  );
}
