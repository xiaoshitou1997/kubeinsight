import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, apiUrl, onRefresh } from './api';
import type { KubeObject } from './types';

interface QueryOptions {
  enabled?: boolean;
  pollMs?: number;
  pausePolling?: boolean;
}

export interface QueryResult<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  refetch: () => void;
  setData: (
    value: T | undefined | ((current: T | undefined) => T | undefined),
  ) => void;
}

export function useApiQuery<T>(
  path: string | null,
  params: Record<string, unknown> = {},
  options: QueryOptions = {},
): QueryResult<T> {
  const enabled = options.enabled !== false && Boolean(path);
  const key = JSON.stringify(params);
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pausePollingRef = useRef(false);
  pausePollingRef.current = Boolean(options.pausePolling);

  const load = useCallback(
    async (background: boolean) => {
      if (!path || !enabled) return;
      if (background && pausePollingRef.current) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const id = ++requestId.current;
      if (!background) setLoading(true);
      try {
        const result = await api<T>(path, JSON.parse(key) as Record<string, unknown>, {
          signal: controller.signal,
        });
        if (id !== requestId.current) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (id !== requestId.current) return;
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof ApiError ? err : new ApiError(0, (err as Error).message));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [path, key, enabled],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void load(false);
    return () => {
      requestId.current += 1;
      abortRef.current?.abort();
    };
  }, [load, enabled, nonce]);

  useEffect(() => {
    if (!enabled) return;
    return onRefresh(() => void load(true));
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled || !options.pollMs) return;
    const timer = window.setInterval(() => void load(true), options.pollMs);
    return () => window.clearInterval(timer);
  }, [enabled, load, options.pollMs]);

  return {
    data,
    error,
    loading,
    refetch: () => setNonce((value) => value + 1),
    setData,
  };
}

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function usePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (value: T) => {
      setState(value);
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* ignore quota errors */
      }
    },
    [key],
  );

  return [state, update];
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · KubeInsight` : 'KubeInsight';
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export type WatchStatus = 'off' | 'connecting' | 'live' | 'reconnecting';

export interface ResourceWatchEvent {
  type: string;
  object?: KubeObject;
  resourceVersion?: string;
}

export type ResourceWatchMessage<T> =
  | { kind: 'snapshot'; data: T }
  | { kind: 'event'; event: ResourceWatchEvent }
  | { kind: 'error'; message?: string }
  | { kind: 'end' };

/**
 * Subscribe to the server-side Kubernetes watch bridge. EventSource handles
 * reconnection; the caller only has to merge snapshots and incremental events.
 */
export function useResourceWatch<T>(
  path: string | null,
  params: Record<string, unknown> = {},
  enabled = true,
  onMessage: (message: ResourceWatchMessage<T>) => void,
): { status: WatchStatus } {
  const key = JSON.stringify(params);
  const messageRef = useRef(onMessage);
  messageRef.current = onMessage;
  const [status, setStatus] = useState<WatchStatus>(
    path && enabled ? 'connecting' : 'off',
  );

  useEffect(() => {
    if (!path || !enabled) {
      setStatus('off');
      return;
    }

    let source: EventSource | null = null;
    let disposed = false;
    setStatus('connecting');

    try {
      source = new EventSource(apiUrl(path, JSON.parse(key) as Record<string, unknown>));
      source.onopen = () => {
        if (!disposed) setStatus('live');
      };
      source.addEventListener('update', (event) => {
        if (disposed) return;
        try {
          const message = JSON.parse((event as MessageEvent<string>).data) as ResourceWatchMessage<T>;
          messageRef.current(message);
          setStatus('live');
        } catch {
          /* ignore malformed frame */
        }
      });
      source.onerror = () => {
        if (!disposed) setStatus('reconnecting');
      };
    } catch {
      setStatus('reconnecting');
    }

    return () => {
      disposed = true;
      source?.close();
    };
  }, [path, key, enabled]);

  return { status };
}
