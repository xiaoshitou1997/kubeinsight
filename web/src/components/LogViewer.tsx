import {
  ArrowDownToLine,
  Download,
  LoaderCircle,
  Pause,
  Play,
  RotateCw,
  Search,
  WrapText,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { apiUrl } from '../api';
import { classNames, formatNumber } from '../lib/format';
import { Badge, IconButton } from './ui';

const MAX_LINES = 5000;

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

type LogStatus = 'connecting' | 'streaming' | 'ended' | 'error';

export function LogViewer({
  namespace,
  pod,
  containers,
  previousAvailable,
}: {
  namespace: string;
  pod: string;
  containers: string[];
  previousAvailable: boolean;
}) {
  const { cluster } = useApp();
  const [container, setContainer] = useState(containers[0] ?? '');
  const [follow, setFollow] = useState(true);
  const [timestamps, setTimestamps] = useState(false);
  const [previous, setPrevious] = useState(false);
  const [tailLines, setTailLines] = useState(500);
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<LogStatus>('connecting');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [wrap, setWrap] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const preRef = useRef<HTMLDivElement>(null);
  const decoderRef = useRef<TextDecoder | null>(null);

  useEffect(() => {
    if (!containers.includes(container)) setContainer(containers[0] ?? '');
  }, [containers, container]);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLines([]);
    setError('');
    setStatus('connecting');
    setAutoScroll(true);

    try {
      const response = await fetch(
        apiUrl('/api/logs', {
          cluster,
          namespace,
          pod,
          container,
          follow: follow ? 1 : undefined,
          timestamps: timestamps ? 1 : undefined,
          previous: previous && previousAvailable ? 1 : undefined,
          tailLines,
        }),
        { signal: controller.signal, credentials: 'same-origin' },
      );

      if (!response.ok) {
        let message = `日志请求失败 (HTTP ${response.status})`;
        try {
          const body = (await response.json()) as { error?: { message?: string } };
          if (body.error?.message) message = body.error.message;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      if (!response.body) throw new Error('当前浏览器不支持流式日志');

      setStatus('streaming');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      decoderRef.current = decoder;
      let buffer = '';
      let closed = false;

      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';
        if (parts.length > 0) {
          setLines((current) => {
            const next = current.concat(parts);
            return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
          });
        }
      }
      buffer += decoder.decode();
      if (buffer) {
        setLines((current) => {
          const next = current.concat(buffer);
          return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
      }
      if (!controller.signal.aborted) setStatus('ended');
    } catch (err) {
      if (controller.signal.aborted) return;
      setError((err as Error).message);
      setStatus('error');
    }
  }, [
    cluster,
    namespace,
    pod,
    container,
    follow,
    timestamps,
    previous,
    previousAvailable,
    tailLines,
    nonce,
  ]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!autoScroll) return;
    const element = preRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines, autoScroll]);

  const onScroll = () => {
    const element = preRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    setAutoScroll(distance < 40);
  };

  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(
        apiUrl('/api/logs', {
          cluster,
          namespace,
          pod,
          container,
          timestamps: timestamps ? 1 : undefined,
          previous: previous && previousAvailable ? 1 : undefined,
          tailLines: 10000,
        }),
        { credentials: 'same-origin' },
      );
      if (!response.ok) throw new Error(`下载失败 (HTTP ${response.status})`);
      const text = await response.text();
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${pod}-${container}.log`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const filtered = filter
    ? lines.filter((line) => line.toLowerCase().includes(filter.toLowerCase()))
    : lines;
  return (
    <div className="log-viewer">
      <div className="log-toolbar">
        {containers.length > 1 ? (
          <select
            className="select select-sm"
            value={container}
            onChange={(event) => setContainer(event.target.value)}
            aria-label="选择容器"
          >
            {containers.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        ) : (
          <span className="log-container">{container || 'default'}</span>
        )}

        <div className="log-search">
          <Search size={13} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="过滤日志"
            aria-label="过滤日志"
          />
        </div>

        <div className="log-controls">
          <label className="checkbox checkbox-sm">
            <input
              type="checkbox"
              checked={timestamps}
              onChange={(event) => setTimestamps(event.target.checked)}
            />
            时间戳
          </label>
          {previousAvailable && (
            <label className="checkbox checkbox-sm" title="查看上一个已终止容器的日志">
              <input
                type="checkbox"
                checked={previous}
                onChange={(event) => setPrevious(event.target.checked)}
              />
              上一次
            </label>
          )}
          <select
            className="select select-sm"
            value={tailLines}
            onChange={(event) => setTailLines(Number(event.target.value))}
            aria-label="日志行数"
          >
            <option value={200}>200 行</option>
            <option value={500}>500 行</option>
            <option value={2000}>2000 行</option>
            <option value={5000}>5000 行</option>
          </select>
          <button
            type="button"
            className={classNames('btn btn-sm', follow ? 'btn-primary-soft' : 'btn-ghost')}
            onClick={() => setFollow((value) => !value)}
            title={follow ? '暂停实时日志' : '继续实时日志'}
          >
            {follow ? <Pause size={13} /> : <Play size={13} />}
            {follow ? '实时' : '已暂停'}
          </button>
          <IconButton icon={RotateCw} label="重新加载" onClick={() => setNonce((value) => value + 1)} />
          <IconButton
            icon={wrap ? ArrowDownToLine : WrapText}
            label={wrap ? '取消自动换行' : '自动换行'}
            active={wrap}
            onClick={() => setWrap((value) => !value)}
          />
          <IconButton
            icon={downloading ? LoaderCircle : Download}
            label="下载日志"
            onClick={() => void download()}
            disabled={downloading}
          />
        </div>
      </div>

      <div className="log-statusbar">
        <Badge
          tone={status === 'error' ? 'err' : status === 'streaming' ? 'ok' : status === 'ended' ? 'muted' : 'warn'}
          pulse={status === 'streaming'}
        >
          {status === 'streaming' ? '实时流' : status === 'connecting' ? '连接中' : status === 'ended' ? '已结束' : '错误'}
        </Badge>
        <span className="muted">
          {formatNumber(filtered.length)} 行{filter ? ` / 共 ${formatNumber(lines.length)} 行` : ''}
        </span>
        {!autoScroll && (
          <button
            type="button"
            className="log-jump"
            onClick={() => {
              setAutoScroll(true);
              const element = preRef.current;
              if (element) element.scrollTop = element.scrollHeight;
            }}
          >
            <ArrowDownToLine size={12} /> 回到底部
          </button>
        )}
      </div>

      {error && <div className="log-error">{error}</div>}

      <div
        className={classNames('log-output', wrap && 'is-wrapped')}
        ref={preRef}
        onScroll={onScroll}
      >
        {filtered.length === 0 && !error && (
          <div className="log-empty">
            {status === 'connecting' ? '正在读取日志…' : '暂无日志输出'}
          </div>
        )}
        {filtered.map((line, index) => {
          const clean = stripAnsi(line);
          const tone = /\b(error|fatal|panic|exception|failed)\b/i.test(clean)
            ? 'log-line-error'
            : /\b(warn|warning)\b/i.test(clean)
              ? 'log-line-warn'
              : '';
          return (
            <div className={classNames('log-line', tone)} key={index}>
              {clean || ' '}
            </div>
          );
        })}
      </div>
    </div>
  );
}
