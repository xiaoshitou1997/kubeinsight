import { useCallback, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ApiError, onUnauthorized } from './api';
import { AppProvider } from './AppContext';
import { LoadingScreen, SetupPage } from './pages/SetupPage';
import { LoginPage } from './pages/LoginPage';
import { Shell } from './components/Shell';
import { OverviewPage } from './pages/OverviewPage';
import { ResourceListPage } from './pages/ResourceListPage';
import { EventsPage } from './pages/EventsPage';
import { ApiExplorerPage } from './pages/ApiExplorerPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import type { Meta } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { tr, useLang } from './i18n';

export function App() {
  useLang();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/meta', { credentials: 'same-origin' });
      if (response.status === 401) {
        setAuthRequired(true);
        setMeta(null);
        setError(null);
        return;
      }
      if (!response.ok) {
        let message = tr(`无法加载集群信息 (HTTP ${response.status})`, `Cannot load cluster information (HTTP ${response.status})`);
        try {
          const body = (await response.json()) as { error?: { message?: string } };
          if (body.error?.message) message = body.error.message;
        } catch {
          /* ignore */
        }
        throw new ApiError(response.status, message);
      }
      const data = (await response.json()) as Meta;
      setMeta(data);
      setAuthRequired(false);
      setError(null);
      document.documentElement.dataset.cluster = data.cluster ?? '';
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
    return onUnauthorized(() => setAuthRequired(true));
  }, [loadMeta]);

  if (authRequired) {
    return (
      <LoginPage
        onSuccess={async () => {
          setAuthRequired(false);
          await loadMeta();
        }}
      />
    );
  }

  if (loading && !meta) {
    return <LoadingScreen label={tr('正在连接 Kubernetes 集群…')} />;
  }

  if (error && !meta) {
    return (
      <div className="fatal-screen">
        <div className="fatal-card">
          <div className="fatal-title">{tr('无法启动控制台')}</div>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => void loadMeta()}>
            {tr('重试')}
          </button>
        </div>
      </div>
    );
  }

  if (!meta || meta.clusters.length === 0) {
    return <SetupPage meta={meta} onRetry={() => void loadMeta()} />;
  }

  return (
    <ErrorBoundary>
      <AppProvider meta={meta} reloadMeta={loadMeta}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<OverviewPage />} />
            <Route path="r/:key" element={<ResourceListPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="explorer" element={<ApiExplorerPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AppProvider>
    </ErrorBoundary>
  );
}
