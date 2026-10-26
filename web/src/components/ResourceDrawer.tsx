import {
  Box,
  Check,
  Activity,
  Copy,
  Ellipsis,
  FileCode,
  LockOpen,
  Pencil,
  RotateCw,
  ScrollText,
  SquareTerminal,
  Trash,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { emitRefresh, post, remove } from '../api';
import { useApp } from '../AppContext';
import { resourceForKind } from '../catalog';
import { useApiQuery } from '../hooks';
import { classNames, formatAgeFromTimestamp } from '../lib/format';
import { statusTone } from '../lib/kube';
import type { KubeObject, ObjectResponse, ResourceRef } from '../types';
import { LogViewer } from './LogViewer';
import { Menu, type MenuItem } from './Menu';
import { Modal, ConfirmDialog } from './Modal';
import { ObjectEvents, RelatedPods } from './Related';
import { ObjectOverview, resourceStatus } from './ObjectOverview';
import { QuickActionsMenu } from './QuickActions';
import { TerminalView } from './TerminalView';
import { ApplyYamlModal, YamlView } from './YamlEditor';
import { Badge, EmptyState, ErrorState, Spinner } from './ui';

type TabId = 'overview' | 'yaml' | 'events' | 'pods' | 'logs' | 'terminal';

interface Tab {
  id: TabId;
  label: string;
}

export function ResourceDrawer({ selection, onClose }: { selection: ResourceRef; onClose: () => void }) {
  const { cluster, meta, can, openResource, notify } = useApp();
  const [tab, setTab] = useState<TabId>('overview');
  const [reveal, setReveal] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pendingEdit, setPendingEdit] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaleValue, setScaleValue] = useState('1');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [propagation, setPropagation] = useState<'Background' | 'Foreground'>('Background');
  const bodyRef = useRef<HTMLDivElement>(null);

  const selectionKey = `${cluster}/${selection.group}/${selection.kind}/${selection.namespace ?? ''}/${selection.name}`;

  const query = useApiQuery<ObjectResponse>(
    '/api/resource',
    {
      cluster,
      group: selection.group,
      version: selection.version,
      plural: selection.plural,
      namespace: selection.namespace,
      name: selection.name,
      reveal: reveal ? 1 : undefined,
    },
    { enabled: Boolean(selection.name) },
  );

  const object = query.data?.object;
  const kind = object?.kind ?? selection.kind;
  const def = resourceForKind(kind, selection.group);
  const Icon = def?.icon ?? Box;
  const status = object ? resourceStatus(object, kind) : '';
  const containers: string[] = (object?.spec?.containers ?? []).map((container: KubeObject) =>
    String(container.name),
  );
  const restarts =
    object?.status?.containerStatuses?.reduce(
      (sum: number, container: KubeObject) => sum + (container.restartCount ?? 0),
      0,
    ) ?? 0;
  const isWorkload = ['Deployment', 'StatefulSet', 'DaemonSet'].includes(kind);
  const isScalable = ['Deployment', 'StatefulSet', 'ReplicaSet'].includes(kind);
  const canPatch = can({ group: selection.group, plural: selection.plural }, 'patch');
  const canDelete = can({ group: selection.group, plural: selection.plural }, 'delete');

  const tabs = useMemo<Tab[]>(() => {
    const base: Tab[] = [
      { id: 'overview', label: '概览' },
      { id: 'yaml', label: 'YAML' },
      { id: 'events', label: '事件' },
    ];
    if (['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job'].includes(kind)) {
      base.push({ id: 'pods', label: 'Pods' });
    }
    if (kind === 'Node') base.push({ id: 'pods', label: 'Pods' });
    if (kind === 'Pod') {
      base.push({ id: 'logs', label: '日志' });
      base.push({ id: 'terminal', label: '终端' });
    }
    return base;
  }, [kind]);

  useEffect(() => {
    setTab('overview');
    setReveal(false);
    setEditorOpen(false);
    setPendingEdit(false);
    setActionError(null);
    query.setData(undefined);
    bodyRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  useEffect(() => {
    if (!tabs.some((item) => item.id === tab)) setTab('overview');
  }, [tabs, tab]);

  useEffect(() => {
    if (pendingEdit && query.data && !query.data.masked) {
      setEditorOpen(true);
      setPendingEdit(false);
    }
  }, [pendingEdit, query.data]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (editorOpen || scaleOpen || deleteOpen || restartOpen) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, editorOpen, scaleOpen, deleteOpen, restartOpen]);

  const openEditor = () => {
    if (kind === 'Secret' && query.data?.masked) {
      setReveal(true);
      setPendingEdit(true);
      notify('已请求显示明文，编辑时请谨慎操作', 'info');
      return;
    }
    setEditorOpen(true);
  };

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(selection.name);
      notify('名称已复制', 'info');
    } catch {
      notify('复制失败，请手动选择', 'err');
    }
  };

  const doDelete = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await remove(
        '/api/resource',
        {
          cluster,
          group: selection.group,
          version: selection.version,
          plural: selection.plural,
          namespace: selection.namespace,
          name: selection.name,
        },
        { propagationPolicy: propagation },
      );
      notify(`${kind} ${selection.name} 已删除`, 'ok');
      emitRefresh();
      onClose();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doScale = async () => {
    const replicas = Number(scaleValue);
    if (!Number.isInteger(replicas) || replicas < 0) {
      setActionError('副本数必须是非负整数');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await post(
        '/api/scale',
        { replicas },
        {
          cluster,
          group: selection.group,
          version: selection.version,
          plural: selection.plural,
          namespace: selection.namespace,
          name: selection.name,
        },
      );
      notify(`已将 ${selection.name} 伸缩到 ${replicas} 个副本`, 'ok');
      setScaleOpen(false);
      query.refetch();
      emitRefresh();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doRestart = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await post(
        '/api/restart',
        {},
        {
          cluster,
          group: selection.group,
          version: selection.version,
          plural: selection.plural,
          namespace: selection.namespace,
          name: selection.name,
        },
      );
      notify(`已触发 ${selection.name} 的滚动重启`, 'ok');
      setRestartOpen(false);
      query.refetch();
      emitRefresh();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doCordon = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const unschedulable = !object?.spec?.unschedulable;
      await post('/api/cordon', { unschedulable }, { cluster, name: selection.name });
      notify(unschedulable ? '节点已封锁' : '节点已恢复调度', 'ok');
      query.refetch();
      emitRefresh();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const menuItems: MenuItem[] = [
    {
      label: '编辑 YAML',
      icon: <Pencil size={14} />,
      onSelect: openEditor,
      disabled: !canPatch,
    },
    ...(kind === 'Secret' && query.data?.masked
      ? [
          {
            label: '显示明文',
            icon: <LockOpen size={14} />,
            onSelect: () => setReveal(true),
          },
        ]
      : []),
    ...(isScalable
      ? [
          {
            label: '扩缩容',
            icon: <RotateCw size={14} />,
            onSelect: () => {
              setScaleValue(String(object?.spec?.replicas ?? object?.status?.replicas ?? 1));
              setScaleOpen(true);
            },
            disabled: !canPatch,
          },
        ]
      : []),
    ...(isWorkload
      ? [
          {
            label: '滚动重启',
            icon: <RotateCw size={14} />,
            onSelect: () => setRestartOpen(true),
            disabled: !canPatch,
          },
        ]
      : []),
    ...(kind === 'Node'
      ? [
          {
            label: object?.spec?.unschedulable ? '恢复调度' : '封锁节点',
            icon: <RotateCw size={14} />,
            onSelect: () => void doCordon(),
            disabled: !canPatch,
          },
        ]
      : []),
    { label: '复制名称', icon: <Copy size={14} />, onSelect: () => void copyName() },
    { label: 'separator', separator: true },
    {
      label: '删除',
      icon: <Trash size={14} />,
      danger: true,
      onSelect: () => setDeleteOpen(true),
      disabled: !canDelete,
    },
  ];

  const terminalDisabled = (() => {
    if (meta.readOnly) return '当前实例运行在只读模式，容器终端已禁用。';
    if (!meta.execEnabled) return '服务端通过 --no-exec 禁用了容器终端。';
    if (object && object.status?.phase !== 'Running') return `Pod 当前处于 ${object.status?.phase ?? 'Unknown'} 状态，无法启动终端。`;
    return undefined;
  })();

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${kind} ${selection.name}`}>
        <header className="drawer-head">
          <div className="drawer-title-row">
            <div className="drawer-icon">
              <Icon size={20} />
            </div>
            <div className="drawer-titles">
              <div className="drawer-eyebrow">
                {kind}
                {selection.group && <span className="muted"> · {selection.group}</span>}
              </div>
              <h2 className="drawer-name" title={selection.name}>
                {selection.name}
              </h2>
              <div className="drawer-sub">
                {object ? (
                  <>
                    <span className="mono">{object.metadata?.namespace ?? '集群级'}</span>
                    <span className="dot-sep" />
                    <span>{formatAgeFromTimestamp(object.metadata?.creationTimestamp)}</span>
                    {status && (
                      <>
                        <span className="dot-sep" />
                        <Badge tone={statusTone(status)}>{status}</Badge>
                      </>
                    )}
                  </>
                ) : (
                  <span className="muted">正在读取对象…</span>
                )}
              </div>
            </div>
            <div className="drawer-actions">
              {object && (
                <QuickActionsMenu
                  object={object}
                  target={{
                    kind,
                    group: selection.group,
                    version: selection.version,
                    plural: selection.plural,
                    namespace: object.metadata?.namespace,
                    name: selection.name,
                  }}
                  canPatch={canPatch}
                  onChanged={() => {
                    query.refetch();
                    emitRefresh();
                  }}
                />
              )}
              {kind === 'Pod' && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTab('logs')}>
                  <ScrollText size={14} /> 日志
                </button>
              )}
              {isScalable && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setScaleValue(String(object?.spec?.replicas ?? 1));
                    setScaleOpen(true);
                  }}
                  disabled={!canPatch}
                >
                  <RotateCw size={14} /> 伸缩
                </button>
              )}
              <Menu
                button={
                  <button type="button" className="icon-btn" aria-label="更多操作">
                    <Ellipsis size={16} />
                  </button>
                }
                items={menuItems}
                width={220}
              />
              <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭详情">
                <X size={17} />
              </button>
            </div>
          </div>

          <div className="drawer-tabbar">
            <nav className="tabs" aria-label="详情标签页">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={classNames('tab', tab === item.id && 'is-active')}
                  onClick={() => setTab(item.id)}
                >
                  {item.id === 'logs' && <ScrollText size={13} />}
                  {item.id === 'terminal' && <SquareTerminal size={13} />}
                  {item.id === 'yaml' && <FileCode size={13} />}
                  {item.id === 'events' && <Activity size={13} />}
                  {item.label}
                </button>
              ))}
            </nav>
            {tab === 'yaml' && query.data && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={openEditor} disabled={!canPatch}>
                <Pencil size={13} /> 编辑
              </button>
            )}
          </div>
        </header>

        {actionError && (
          <div className="drawer-error">
            <span>{actionError}</span>
            <button type="button" className="icon-btn" onClick={() => setActionError(null)} aria-label="关闭错误">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="drawer-body" ref={bodyRef}>
          {query.loading && !object ? (
            <DrawerSkeleton />
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={query.refetch} />
          ) : !object ? (
            <EmptyState icon={Box} title="对象不存在" description="它可能已被删除或没有访问权限。" />
          ) : (
            <>
              {tab === 'overview' && (
                <ObjectOverview
                  object={object}
                  masked={query.data?.masked}
                  onReveal={() => setReveal(true)}
                  onOpenResource={openResource}
                />
              )}
              {tab === 'yaml' && (
                <div className="yaml-tab">
                  {query.data?.masked ? (
                    <div className="masked-yaml">
                      <LockOpen size={18} />
                      <div>
                        <strong>Secret 内容已脱敏</strong>
                        <p>为了避免密钥进入浏览器内存，默认不返回 data 字段。显示明文后可查看与编辑。</p>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReveal(true)}>
                          <LockOpen size={13} /> 显示明文
                        </button>
                      </div>
                    </div>
                  ) : (
                    <YamlView
                      value={query.data?.yaml ?? ''}
                      filename={`${kind}-${selection.name}.yaml`}
                    />
                  )}
                </div>
              )}
              {tab === 'events' && (
                <ObjectEvents
                  namespace={object.metadata?.namespace}
                  kind={kind}
                  name={selection.name}
                />
              )}
              {tab === 'pods' && (
                <RelatedPods
                  namespace={object.metadata?.namespace}
                  selector={selectorFor(object)}
                  nodeName={kind === 'Node' ? selection.name : undefined}
                  onOpen={openResource}
                />
              )}
              {tab === 'logs' && (
                <LogViewer
                  namespace={object.metadata?.namespace}
                  pod={selection.name}
                  containers={containers}
                  previousAvailable={restarts > 0}
                />
              )}
              {tab === 'terminal' && (
                <TerminalView
                  namespace={object.metadata?.namespace}
                  pod={selection.name}
                  containers={containers}
                  disabledReason={terminalDisabled}
                />
              )}
            </>
          )}
        </div>
      </aside>

      <ApplyYamlModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={`编辑 ${kind}`}
        subtitle={`${selection.namespace ? `${selection.namespace}/` : ''}${selection.name}`}
        initialYaml={query.data?.yaml ?? ''}
        namespace={object?.metadata?.namespace}
        onApplied={() => {
          query.refetch();
          emitRefresh();
        }}
      />

      <Modal
        open={scaleOpen}
        onClose={() => setScaleOpen(false)}
        title="调整副本数"
        subtitle={`${kind} / ${selection.name}`}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setScaleOpen(false)} disabled={busy}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void doScale()} disabled={busy}>
              {busy ? <Spinner /> : <Check size={14} />} 应用
            </button>
          </>
        }
      >
        <label className="form-label" htmlFor="scale-value">
          期望副本数
        </label>
        <div className="scale-input">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setScaleValue(String(Math.max(0, Number(scaleValue) - 1)))}
          >
            −
          </button>
          <input
            id="scale-value"
            className="input"
            type="number"
            min={0}
            max={100000}
            value={scaleValue}
            onChange={(event) => setScaleValue(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setScaleValue(String(Number(scaleValue) + 1))}
          >
            +
          </button>
        </div>
        <p className="form-hint">
          当前副本：{object?.status?.readyReplicas ?? 0} ready / {object?.spec?.replicas ?? 0} desired
        </p>
      </Modal>

      <ConfirmDialog
        open={restartOpen}
        title={`重启 ${kind}？`}
        description="将更新 Pod 模板的 restartedAt 注解，触发一次滚动重启。服务在滚动过程中保持可用。"
        confirmLabel="滚动重启"
        busy={busy}
        onCancel={() => setRestartOpen(false)}
        onConfirm={() => void doRestart()}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={`删除 ${kind} ${selection.name}？`}
        description="该操作不可撤销。级联删除会同时清理其管理的 Pod；集群级对象可能影响多个命名空间。"
        confirmLabel="删除"
        danger
        busy={busy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void doDelete()}
      >
        <label className="form-label" htmlFor="propagation">
          级联策略
        </label>
        <select
          id="propagation"
          className="select"
          value={propagation}
          onChange={(event) => setPropagation(event.target.value as 'Background' | 'Foreground')}
        >
          <option value="Background">Background（推荐）</option>
          <option value="Foreground">Foreground（等待级联完成）</option>
        </select>
      </ConfirmDialog>
    </div>
  );
}

function selectorFor(object: KubeObject): string {
  const selector = object.spec?.selector;
  if (!selector) return '';
  if (selector.matchLabels) {
    return Object.entries(selector.matchLabels)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
  }
  if (typeof selector === 'object') {
    return Object.entries(selector)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
  }
  return '';
}

function DrawerSkeleton() {
  return (
    <div className="drawer-skeleton">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="drawer-skeleton-block" key={index}>
          <span className="skeleton" style={{ height: 12, width: '22%' }} />
          <span className="skeleton" style={{ height: 64, width: '100%' }} />
        </div>
      ))}
    </div>
  );
}

