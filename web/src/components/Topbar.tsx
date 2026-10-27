import {
  Check,
  ChevronDown,
  FolderTree,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../api';
import { useApp } from '../AppContext';
import { RESOURCES } from '../catalog';
import { classNames, formatAge } from '../lib/format';
import { tr } from '../i18n';
import { useNow } from '../hooks';
import { IconButton, Kbd } from './ui';
import { LanguageToggle } from './LanguageToggle';
import { Menu } from './Menu';

export function Topbar() {
  const {
    meta,
    clusterInfo,
    namespace,
    setNamespace,
    namespaces,
    refreshInterval,
    setRefreshInterval,
    refreshNow,
    lastRefresh,
    theme,
    toggleTheme,
    access,
    setPaletteOpen,
    setNavOpen,
  } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const now = useNow(1000);

  const pageKey = location.pathname.startsWith('/r/') ? location.pathname.slice(3) : '';
  const pageTitle =
    location.pathname === '/'
      ? tr('概览')
      : location.pathname === '/events'
        ? tr('事件')
        : location.pathname === '/explorer'
          ? 'API Explorer'
          : location.pathname === '/settings'
            ? tr('设置')
            : RESOURCES[pageKey]?.label ?? tr('资源');
  const refreshAge = Math.max(0, Math.floor((now - lastRefresh) / 1000));
  const username = access?.identity?.username;
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="icon-btn topbar-menu"
          onClick={() => setNavOpen(true)}
          aria-label={tr('打开导航')}
        >
          <MenuIcon size={17} />
        </button>
        <div className="crumbs">
          <span className="crumb-cluster">
            <span className={classNames('connection-dot', meta.reachable ? 'is-online' : 'is-offline')} />
            {clusterInfo?.name ?? tr('集群')}
          </span>
          <span className="crumb-sep">/</span>
          <span className="crumb-page">{pageTitle}</span>
        </div>
      </div>

      <div className="topbar-right">
        {meta.readOnly && <span className="read-only-badge">{tr('只读模式')}</span>}

        <Menu
          ariaLabel={tr('切换命名空间')}
          width={260}
          button={
            <button
              type="button"
              className="ns-picker"
              title={tr('切换命名空间')}
              aria-label={tr('命名空间')}
            >
              <FolderTree size={14} />
              <span className="ns-picker-label">{namespace || tr('全部命名空间')}</span>
              <ChevronDown size={13} className="ns-chevron" />
            </button>
          }
          items={[
            {
              label: tr('全部命名空间'),
              icon: namespace ? <FolderTree size={14} /> : <Check size={14} />,
              onSelect: () => setNamespace(''),
            },
            ...(namespace && !namespaces.includes(namespace)
              ? [
                  {
                    label: namespace,
                    icon: <Check size={14} />,
                    onSelect: () => setNamespace(namespace),
                  },
                ]
              : []),
            ...namespaces.map((item) => ({
              label: item,
              icon: namespace === item ? <Check size={14} /> : undefined,
              onSelect: () => setNamespace(item),
            })),
          ]}
        />

        <Menu
          ariaLabel={tr('自动刷新设置')}
          width={210}
          button={
            <button type="button" className="topbar-action" title={tr('自动刷新设置')}>
              <Radio size={14} className={refreshInterval ? 'live-dot' : ''} />
              <span className="topbar-action-label">
                {refreshInterval ? `${refreshInterval}s` : tr('手动')}
              </span>
            </button>
          }
          items={[
            {
              label: tr('关闭自动刷新'),
              hint: refreshInterval === 0 ? tr('当前') : '',
              onSelect: () => setRefreshInterval(0),
            },
            {
              label: tr('每 5 秒'),
              hint: refreshInterval === 5 ? tr('当前') : '',
              onSelect: () => setRefreshInterval(5),
            },
            {
              label: tr('每 10 秒'),
              hint: refreshInterval === 10 ? tr('当前') : '',
              onSelect: () => setRefreshInterval(10),
            },
            {
              label: tr('每 30 秒'),
              hint: refreshInterval === 30 ? tr('当前') : '',
              onSelect: () => setRefreshInterval(30),
            },
            { label: 'sep', separator: true },
            { label: tr('立即刷新'), icon: <RefreshCw size={14} />, onSelect: refreshNow },
          ]}
        />

        <button type="button" className="topbar-search" onClick={() => setPaletteOpen(true)}>
          <Search size={15} />
          <span>{tr('搜索资源')}</span>
          <Kbd>{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
        </button>

        <IconButton
          icon={RefreshCw}
          label={tr(`刷新（上次更新 ${formatAge(refreshAge)}）`, `Refresh (updated ${formatAge(refreshAge)} ago)`)}
          onClick={refreshNow}
        />
        <LanguageToggle compact />
        <IconButton
          icon={theme === 'dark' ? Sun : Moon}
          label={tr('切换主题')}
          onClick={toggleTheme}
        />

        <Menu
          width={240}
          ariaLabel={tr('用户菜单')}
          button={
            <button type="button" className="user-chip" title={username ?? tr('当前身份')}>
              <span className="avatar">{(username ?? 'K').slice(0, 1).toUpperCase()}</span>
            </button>
          }
          items={[
            {
              label: username ?? tr('未识别身份'),
              hint: tr('当前'),
              icon: <User size={14} />,
              onSelect: () => navigate('/settings'),
            },
            { label: 'sep', separator: true },
            {
              label: tr('设置与权限'),
              icon: <Settings size={14} />,
              onSelect: () => navigate('/settings'),
            },
            {
              label: theme === 'dark' ? tr('切换到浅色主题') : tr('切换到深色主题'),
              icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
              onSelect: toggleTheme,
            },
            ...(meta.authEnabled
              ? [
                  { label: 'sep', separator: true },
                  {
                    label: tr('退出登录'),
                    icon: <LogOut size={14} />,
                    danger: true,
                    onSelect: () => {
                      void logout().then(() => window.location.reload());
                    },
                  },
                ]
              : []),
          ]}
        />
      </div>
    </header>
  );
}
