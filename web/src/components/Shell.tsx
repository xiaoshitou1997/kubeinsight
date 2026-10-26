import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { useApp } from '../AppContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { ResourceDrawer } from './ResourceDrawer';
import { ToastViewport } from './Toast';
import { classNames } from '../lib/format';
import { tr } from '../i18n';

export function Shell() {
  const {
    meta,
    clusterInfo,
    navOpen,
    setNavOpen,
    paletteOpen,
    setPaletteOpen,
    selection,
    closeResource,
    refreshNow,
    reloadMeta,
  } = useApp();
  const location = useLocation();

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname, setNavOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setPaletteOpen]);

  const warnings = [...(meta.warnings ?? []), ...(clusterInfo?.warnings ?? [])];

  return (
    <div className="app-shell">
      <Sidebar />
      <div className={classNames('sidebar-scrim', navOpen && 'is-visible')} onClick={() => setNavOpen(false)} />
      <div className="app-main">
        <Topbar />
        <div className="banner-stack">
          {!meta.reachable && (
            <div className="banner banner-danger">
              <CircleAlert size={15} />
              <div className="banner-content">
                <strong>{tr('集群 API 当前不可达')}</strong>
                <span>{meta.error ?? tr('请检查 kubeconfig、网络连通性与 API Server 证书。')}</span>
              </div>
              <button
                type="button"
                className="banner-action"
                onClick={() => {
                  void reloadMeta();
                  refreshNow();
                }}
              >
                <RefreshCw size={13} /> {tr('重试')}
              </button>
            </div>
          )}
          {meta.reachable && warnings.length > 0 && (
            <div className="banner banner-warn">
              <CircleAlert size={15} />
              <div className="banner-content">
                <strong>{tr('配置提示')}</strong>
                <span>{warnings[0]}</span>
                {warnings.length > 1 && (
                  <span className="muted">
                    {tr('另有 {{count}} 条提示', '{{count}} more notices', {
                      count: warnings.length - 1,
                    })}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        <main className="content">
          <Outlet />
        </main>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {selection && <ResourceDrawer selection={selection} onClose={closeResource} />}
      <ToastViewport />
    </div>
  );
}
