import {
  Activity,
  Check,
  ChevronDown,
  ListTree,
  Settings,
  ScrollText,
  Server,
} from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext';
import { RESOURCES, NAV_GROUPS } from '../catalog';
import { classNames } from '../lib/format';
import { Logo } from './Logo';
import { Menu } from './Menu';

export function Sidebar() {
  const { meta, cluster, clusterInfo, setCluster, navOpen } = useApp();
  const navigate = useNavigate();

  const host = (() => {
    try {
      return new URL(clusterInfo?.server ?? '').host;
    } catch {
      return clusterInfo?.server ?? '';
    }
  })();

  return (
    <aside className={classNames('sidebar', navOpen && 'is-open')}>
      <Link to="/" className="brand" aria-label="KubeInsight 首页">
        <Logo size={30} />
        <div className="brand-text">
          <span className="brand-name">KubeInsight</span>
          <span className="brand-sub">K8s console</span>
        </div>
      </Link>

      <Menu
        width={320}
        align="left"
        ariaLabel="切换集群"
        button={
          <button type="button" className="cluster-switch" title={clusterInfo?.server ?? ''}>
            <span className="cluster-dot" />
            <span className="cluster-text">
              <span className="cluster-name">{clusterInfo?.name ?? '选择集群'}</span>
              <span className="cluster-host">{host}</span>
            </span>
            <ChevronDown size={14} className="cluster-chevron" />
          </button>
        }
        items={[
          ...meta.clusters.map((item) => ({
            label: item.name,
            hint: (() => {
              try {
                return new URL(item.server).host;
              } catch {
                return item.server;
              }
            })(),
            icon: item.id === cluster ? <Check size={14} /> : <Server size={14} />,
            onSelect: () => setCluster(item.id),
          })),
          { label: 'separator', separator: true },
          {
            label: '集群与访问设置',
            icon: <Settings size={14} />,
            onSelect: () => navigate('/settings'),
          },
        ]}
      />

      <nav className="sidebar-nav" aria-label="主导航">
        <NavLink to="/" end className={({ isActive }) => classNames('nav-item', isActive && 'is-active')}>
          <Activity size={16} />
          <span>概览</span>
        </NavLink>

        {NAV_GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-group-label">{group.label}</div>
            {group.keys.map((key) => {
              const resource = RESOURCES[key];
              if (!resource) return null;
              const Icon = resource.icon;
              return (
                <div key={key}>
                  <NavLink
                    to={`/r/${key}`}
                    className={({ isActive }) => classNames('nav-item', isActive && 'is-active')}
                  >
                    <Icon size={16} />
                    <span>{resource.label}</span>
                  </NavLink>
                  {key === 'namespaces' && (
                    <NavLink
                      to="/events"
                      className={({ isActive }) => classNames('nav-item', isActive && 'is-active')}
                    >
                      <ScrollText size={16} />
                      <span>Events</span>
                    </NavLink>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <NavLink
          to="/explorer"
          className={({ isActive }) => classNames('nav-item', isActive && 'is-active')}
        >
          <ListTree size={16} />
          <span>API Explorer</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <NavLink
          to="/settings"
          className={({ isActive }) => classNames('nav-item', isActive && 'is-active')}
        >
          <Settings size={16} />
          <span>设置</span>
        </NavLink>
        <div className="sidebar-meta">
          <span className="version-tag">v{meta.app.version}</span>
          <span className={classNames('connection-dot', meta.reachable ? 'is-online' : 'is-offline')} />
          <span className="muted">{meta.reachable ? '已连接' : '离线'}</span>
        </div>
      </div>
    </aside>
  );
}
