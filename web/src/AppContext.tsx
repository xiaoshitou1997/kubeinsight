import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { emitRefresh, setDefaultCluster } from './api';
import { useApiQuery, usePersistentState } from './hooks';
import type {
  AccessResponse,
  ClusterInfo,
  ListResponse,
  Meta,
  ResourceRef,
} from './types';

interface Toast {
  id: number;
  tone: 'ok' | 'err' | 'info';
  message: string;
  detail?: string;
}

export interface CapabilityTarget {
  group: string;
  plural: string;
  namespaced?: boolean;
}

interface AppContextValue {
  meta: Meta;
  reloadMeta: () => Promise<void>;
  cluster: string;
  clusterInfo: ClusterInfo | undefined;
  setCluster: (id: string) => void;
  namespace: string;
  setNamespace: (namespace: string) => void;
  namespaces: string[];
  namespacesLoading: boolean;
  refreshInterval: number;
  setRefreshInterval: (seconds: number) => void;
  refreshNow: () => void;
  lastRefresh: number;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  access: AccessResponse | undefined;
  can: (resource: CapabilityTarget, verb: string) => boolean;
  selection: ResourceRef | null;
  openResource: (ref: ResourceRef) => void;
  closeResource: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  notify: (message: string, tone?: Toast['tone'], detail?: string) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  meta,
  reloadMeta,
  children,
}: {
  meta: Meta;
  reloadMeta: () => Promise<void>;
  children: ReactNode;
}) {
  const defaultCluster =
    window.localStorage.getItem('ki.cluster') || meta.defaultCluster || meta.clusters[0]?.id || '';
  const [cluster, setClusterState] = useState(
    meta.clusters.some((item) => item.id === defaultCluster) ? defaultCluster : meta.clusters[0]?.id ?? '',
  );
  const [namespace, setNamespaceState] = useState('');
  const [refreshInterval, setRefreshIntervalState] = usePersistentState<number>('ki.refreshInterval', 10);
  const [theme, setTheme] = usePersistentState<'dark' | 'light'>('ki.theme', 'dark');
  const [selection, setSelection] = useState<ResourceRef | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastRefresh, setLastRefresh] = useState(() => Date.now());
  const toastId = useRef(0);

  setDefaultCluster(cluster || null);

  useEffect(() => {
    if (!meta.clusters.some((item) => item.id === cluster)) {
      const fallback = meta.defaultCluster ?? meta.clusters[0]?.id ?? '';
      if (fallback !== cluster) setClusterState(fallback);
    }
  }, [meta, cluster]);

  useEffect(() => {
    if (!cluster) return;
    window.localStorage.setItem('ki.cluster', cluster);
    const stored = window.localStorage.getItem(`ki.ns.${cluster}`) ?? '';
    setNamespaceState(stored);
    setSelection(null);
  }, [cluster]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('ki.theme', JSON.stringify(theme));
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#0a0d12' : '#f4f6fa');
  }, [theme]);

  const setCluster = useCallback((id: string) => {
    setClusterState(id);
    setNavOpen(false);
  }, []);

  const setNamespace = useCallback(
    (value: string) => {
      setNamespaceState(value);
      if (cluster) window.localStorage.setItem(`ki.ns.${cluster}`, value);
    },
    [cluster],
  );

  const setRefreshInterval = useCallback(
    (seconds: number) => {
      setRefreshIntervalState(seconds);
    },
    [setRefreshIntervalState],
  );

  const refreshNow = useCallback(() => {
    emitRefresh();
    setLastRefresh(Date.now());
  }, []);

  useEffect(() => {
    if (!refreshInterval) return;
    const timer = window.setInterval(() => {
      emitRefresh();
      setLastRefresh(Date.now());
    }, refreshInterval * 1000);
    return () => window.clearInterval(timer);
  }, [refreshInterval]);

  const namespacesQuery = useApiQuery<ListResponse>(
    '/api/resources',
    { cluster, group: '', version: 'v1', plural: 'namespaces', limit: 1000 },
    { enabled: Boolean(cluster) },
  );

  const accessQuery = useApiQuery<AccessResponse>(
    '/api/access',
    { cluster, namespace: namespace || 'default' },
    { enabled: Boolean(cluster) },
  );

  const namespaces = useMemo(() => {
    const items = namespacesQuery.data?.items ?? [];
    return items.map((item) => String(item.metadata?.name ?? '')).filter(Boolean).sort();
  }, [namespacesQuery.data]);

  const notify = useCallback((message: string, tone: Toast['tone'] = 'ok', detail?: string) => {
    const id = ++toastId.current;
    setToasts((current) => [...current.slice(-3), { id, message, tone, detail }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, tone === 'err' ? 8000 : 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const can = useCallback(
    (resource: CapabilityTarget, verb: string) => {
      if (meta.readOnly) return false;
      const access = accessQuery.data;
      if (!access || access.error) return true;
      if (access.allVerbs.includes('*')) return true;
      const keys = [
        `${resource.group}/${resource.plural}`,
        `*/${resource.plural}`,
        `${resource.group}/*`,
        '*/*',
      ];
      for (const key of keys) {
        const verbs = access.capabilities[key];
        if (verbs && (verbs.includes(verb) || verbs.includes('*'))) return true;
      }
      return false;
    },
    [accessQuery.data, meta.readOnly],
  );

  const openResource = useCallback((ref: ResourceRef) => {
    setSelection(ref);
    setPaletteOpen(false);
  }, []);

  const closeResource = useCallback(() => setSelection(null), []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const clusterInfo = meta.clusters.find((item) => item.id === cluster);

  return (
    <AppContext.Provider
      value={{
        meta,
        reloadMeta,
        cluster,
        clusterInfo,
        setCluster,
        namespace,
        setNamespace,
        namespaces,
        namespacesLoading: namespacesQuery.loading,
        refreshInterval,
        setRefreshInterval,
        refreshNow,
        lastRefresh,
        theme,
        toggleTheme,
        access: accessQuery.data,
        can,
        selection,
        openResource,
        closeResource,
        paletteOpen,
        setPaletteOpen,
        navOpen,
        setNavOpen,
        notify,
        toasts,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
