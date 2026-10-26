import {
  Check,
  ChevronRight,
  Cpu,
  FolderTree,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Server,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { logout } from '../api';
import { useApp } from '../AppContext';
import { Badge, Field, PageHeader, Segmented, Skeleton } from '../components/ui';
import { useDocumentTitle } from '../hooks';
import { classNames, formatDateTime } from '../lib/format';

export function SettingsPage() {
  useDocumentTitle('设置');
  const {
    meta,
    cluster,
    clusterInfo,
    setCluster,
    access,
    namespace,
    theme,
    toggleTheme,
    refreshInterval,
    setRefreshInterval,
    reloadMeta,
    notify,
  } = useApp();

  const isAdmin = Boolean(access?.allVerbs.includes('*'));
  const authLabel = (auth: string) => {
    switch (auth) {
      case 'client-cert':
        return '客户端证书';
      case 'token':
        return 'Bearer Token';
      case 'exec':
        return 'Exec 凭证插件';
      case 'basic':
        return 'Basic Auth';
      default:
        return '匿名';
    }
  };

  return (
    <div className="page settings-page">
      <PageHeader
        icon={Server}
        eyebrow="SETTINGS"
        title="设置"
        description="集群连接、当前身份、界面偏好与运行信息。"
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void reloadMeta()}>
            <RefreshCw size={14} /> 重新加载元数据
          </button>
        }
      />

      <div className="settings-grid">
        <section className="panel settings-card settings-clusters">
          <div className="settings-card-head">
            <div className="settings-card-title">
              <Server size={16} />
              <h2>集群连接</h2>
            </div>
            <span className="muted">{meta.clusters.length} 个上下文</span>
          </div>
          <div className="cluster-list">
            {meta.clusters.map((item) => (
              <button
                type="button"
                key={item.id}
                className={classNames('cluster-card', item.id === cluster && 'is-active')}
                onClick={() => {
                  setCluster(item.id);
                  notify(`已切换到 ${item.name}`, 'info');
                }}
              >
                <span className="cluster-card-main">
                  <span className="cluster-card-name">
                    {item.name}
                    {item.id === cluster && <Badge tone="ok" dot={false}>当前</Badge>}
                  </span>
                  <span className="cluster-card-server mono">{item.server}</span>
                  <span className="cluster-card-meta">
                    <span>{authLabel(item.auth)}</span>
                    <span className="dot-sep" />
                    <span>默认命名空间 {item.namespace}</span>
                    {item.insecure && (
                      <>
                        <span className="dot-sep" />
                        <span className="text-warn">跳过 TLS 校验</span>
                      </>
                    )}
                  </span>
                  {item.warnings.length > 0 && (
                    <span className="cluster-card-warning">{item.warnings.join(' · ')}</span>
                  )}
                </span>
                <span className="cluster-card-side">
                  {item.id === cluster ? <Check size={16} /> : <ChevronRight size={16} />}
                </span>
              </button>
            ))}
          </div>
          <div className="settings-footnote">
            集群列表来自服务端 KUBECONFIG，KubeInsight 不会把证书或 Token 发送到浏览器。
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-card-head">
            <div className="settings-card-title">
              <User size={16} />
              <h2>当前身份</h2>
            </div>
            {access ? (
              <Badge tone={isAdmin ? 'warn' : 'ok'} dot={false}>
                {isAdmin ? '集群管理员' : '受限权限'}
              </Badge>
            ) : (
              <Skeleton height={20} width={80} />
            )}
          </div>
          {access ? (
            <>
              <div className="identity-hero">
                <div className="identity-avatar">
                  {(access.identity?.username ?? 'K').slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="identity-name mono">
                    {access.identity?.username ?? '未识别（SelfSubjectReview 不可用）'}
                  </div>
                  <div className="identity-sub">
                    规则评估命名空间 <code>{access.namespace}</code>
                  </div>
                </div>
              </div>
              <div className="settings-fields">
                <Field label="命名空间">{namespace || '全部命名空间'}</Field>
                <Field label="资源规则">{access.rules.length} 条</Field>
                <Field label="通配动词" mono>
                  {access.allVerbs.length > 0 ? access.allVerbs.join(', ') : '—'}
                </Field>
                <Field label="只读模式">{meta.readOnly ? '是' : '否'}</Field>
              </div>
              {access.identity?.groups && access.identity.groups.length > 0 && (
                <div className="settings-block">
                  <div className="settings-block-label">用户组</div>
                  <div className="chips">
                    {access.identity.groups.map((group) => (
                      <span className="chip" key={group}>
                        <span className="chip-key">{group}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {access.error && (
                <div className="inline-note inline-note-warn">
                  权限自检失败：{access.error}。界面将不做按钮级限制，最终由 API Server 鉴权。
                </div>
              )}
              {access.incomplete && (
                <div className="inline-note inline-note-warn">
                  规则列表不完整（规则数量超过服务端限制），部分操作可能被错误展示。
                </div>
              )}
            </>
          ) : (
            <div className="settings-skeleton">
              <Skeleton height={42} />
              <Skeleton height={14} width="60%" />
              <Skeleton height={14} width="40%" />
            </div>
          )}
        </section>

        <section className="panel settings-card">
          <div className="settings-card-head">
            <div className="settings-card-title">
              <Monitor size={16} />
              <h2>界面偏好</h2>
            </div>
          </div>
          <div className="settings-block">
            <div className="settings-block-label">主题</div>
            <div className="theme-picker">
              <button
                type="button"
                className={classNames('theme-option', theme === 'dark' && 'is-active')}
                onClick={() => theme !== 'dark' && toggleTheme()}
              >
                <Moon size={16} /> 深色
              </button>
              <button
                type="button"
                className={classNames('theme-option', theme === 'light' && 'is-active')}
                onClick={() => theme !== 'light' && toggleTheme()}
              >
                <Sun size={16} /> 浅色
              </button>
            </div>
          </div>
          <div className="settings-block">
            <div className="settings-block-label">自动刷新</div>
            <Segmented
              value={String(refreshInterval)}
              onChange={(value) => setRefreshInterval(Number(value))}
              options={[
                { value: '0', label: '关闭' },
                { value: '5', label: '5 秒' },
                { value: '10', label: '10 秒' },
                { value: '30', label: '30 秒' },
              ]}
              ariaLabel="自动刷新间隔"
            />
            <p className="form-hint">所有列表、概览与事件会按该间隔静默刷新；切换页面立即生效。</p>
          </div>
          <div className="settings-block">
            <div className="settings-block-label">终端与写操作</div>
            <div className="settings-kv">
              <span>容器终端</span>
              <Badge tone={meta.execEnabled && !meta.readOnly ? 'ok' : 'muted'}>
                {meta.readOnly ? '只读模式禁用' : meta.execEnabled ? '可用' : '已禁用'}
              </Badge>
            </div>
            <div className="settings-kv">
              <span>写操作（创建 / 修改 / 删除）</span>
              <Badge tone={meta.readOnly ? 'warn' : 'ok'}>{meta.readOnly ? '只读' : '可用'}</Badge>
            </div>
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-card-head">
            <div className="settings-card-title">
              <ShieldCheck size={16} />
              <h2>运行信息</h2>
            </div>
            <Badge tone={meta.reachable ? 'ok' : 'err'}>{meta.reachable ? '在线' : '离线'}</Badge>
          </div>
          <div className="settings-fields">
            <Field label="KubeInsight">{meta.app.version}</Field>
            <Field label="Kubernetes">{meta.version?.gitVersion ?? '—'}</Field>
            <Field label="API Server" mono>{clusterInfo?.server ?? '—'}</Field>
            <Field label="kubeconfig">{meta.kubeconfigSource ?? '—'}</Field>
            <Field label="共享令牌认证">{meta.authEnabled ? '已启用' : '未启用'}</Field>
            <Field label="运行时">{meta.runtime ? `Node ${meta.runtime.node}` : '—'}</Field>
            <Field label="启动时间">{formatDateTime(new Date(meta.app.startedAt).toISOString())}</Field>
          </div>
          {meta.warnings.length > 0 && (
            <div className="inline-note inline-note-warn">{meta.warnings.join(' · ')}</div>
          )}
          <div className="settings-block">
            <div className="settings-block-label">快捷键</div>
            <div className="shortcut-list">
              <div><kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> 打开资源搜索</div>
              <div><kbd>↵</kbd> 打开选中的结果</div>
              <div><kbd>esc</kbd> 关闭抽屉 / 弹窗</div>
            </div>
          </div>
          {meta.authEnabled && (
            <button
              type="button"
              className="btn btn-danger-soft settings-logout"
              onClick={() => {
                void logout().then(() => window.location.reload());
              }}
            >
              <LogOut size={14} /> 退出登录
            </button>
          )}
        </section>
      </div>

      <div className="settings-about">
        <KeyRound size={13} />
        <span>
          凭证仅在服务端内存中使用；所有请求通过当前 kubeconfig 身份直接访问 API Server，KubeInsight 不持久化任何集群数据。
        </span>
        <Cpu size={13} />
        <span>单进程 · 无数据库 · 无 Agent</span>
        <FolderTree size={13} />
        <span>{meta.clusters.length} 个上下文</span>
      </div>
    </div>
  );
}
