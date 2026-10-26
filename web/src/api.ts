export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let defaultCluster: string | null = null;
const refreshListeners = new Set<() => void>();
const unauthorizedListeners = new Set<() => void>();

export function setDefaultCluster(clusterId: string | null): void {
  defaultCluster = clusterId;
}

export function getDefaultCluster(): string | null {
  return defaultCluster;
}

export function onRefresh(listener: () => void): () => void {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

export function emitRefresh(): void {
  for (const listener of refreshListeners) listener();
}

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function emitUnauthorized(): void {
  for (const listener of unauthorizedListeners) listener();
}

export function apiUrl(path: string, params: Record<string, unknown> = {}): string {
  const url = new URL(path, window.location.origin);
  if (defaultCluster && params.cluster === undefined) {
    url.searchParams.set('cluster', defaultCluster);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function api<T>(
  path: string,
  params: Record<string, unknown> = {},
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 60_000);
  if (init.signal) {
    const external = init.signal;
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path, params), {
      credentials: 'same-origin',
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new ApiError(0, '请求超时或已取消');
    }
    throw new ApiError(0, '无法连接到 KubeInsight 服务');
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = `请求失败 (HTTP ${response.status})`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: { message?: string; code?: string } };
      if (body.error?.message) message = body.error.message;
      code = body.error?.code;
    } catch {
      /* not JSON */
    }
    if (response.status === 401 && code === 'AUTH_REQUIRED') emitUnauthorized();
    throw new ApiError(response.status, message, code);
  }

  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) return (await response.text()) as T;
  return (await response.json()) as T;
}

export function post<T>(path: string, body: unknown, params: Record<string, unknown> = {}): Promise<T> {
  return api<T>(path, params, { method: 'POST', body: JSON.stringify(body) });
}

export function remove<T>(path: string, params: Record<string, unknown> = {}, body?: unknown): Promise<T> {
  return api<T>(path, params, {
    method: 'DELETE',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function login(token: string): Promise<void> {
  await post('/api/login', { token });
}

export async function logout(): Promise<void> {
  await post('/api/logout', {});
}
