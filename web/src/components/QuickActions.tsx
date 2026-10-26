import {
  Box,
  Clock,
  Cpu,
  Plus,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Trash,
  WandSparkles,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { post } from '../api';
import { useApp } from '../AppContext';
import { classNames } from '../lib/format';
import type { KubeObject } from '../types';
import { Menu, type MenuItem } from './Menu';
import { Modal } from './Modal';
import { Badge, Spinner } from './ui';

export interface QuickTarget {
  kind: string;
  group: string;
  version: string;
  plural: string;
  namespace?: string;
  name: string;
}

type ModalKind = 'image' | 'resources' | 'metadata' | 'schedule';

const IMAGE_KINDS = new Set(['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'CronJob']);
const RESOURCE_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'CronJob']);

function workloadSpec(object: KubeObject, kind: string): KubeObject | undefined {
  switch (kind) {
    case 'Pod':
      return object.spec;
    case 'Deployment':
    case 'StatefulSet':
    case 'DaemonSet':
    case 'ReplicaSet':
    case 'Job':
      return object.spec?.template?.spec;
    case 'CronJob':
      return object.spec?.jobTemplate?.spec?.template?.spec;
    default:
      return undefined;
  }
}

function workloadContainers(
  object: KubeObject,
  kind: string,
  section: 'containers' | 'initContainers' = 'containers',
): KubeObject[] {
  const containers = workloadSpec(object, kind)?.[section];
  return Array.isArray(containers) ? containers : [];
}

export function supportsImageUpdate(kind: string): boolean {
  return IMAGE_KINDS.has(kind);
}

export function supportsResourceUpdate(kind: string): boolean {
  return RESOURCE_KINDS.has(kind);
}

interface ContainerEntry {
  section: 'containers' | 'initContainers';
  key: string;
  name: string;
  image: string;
}

function imageEntries(object: KubeObject, kind: string): ContainerEntry[] {
  return [
    ...workloadContainers(object, kind, 'containers').map((container) => ({
      section: 'containers' as const,
      key: `c:${container.name}`,
      name: String(container.name),
      image: String(container.image ?? ''),
    })),
    ...workloadContainers(object, kind, 'initContainers').map((container) => ({
      section: 'initContainers' as const,
      key: `i:${container.name}`,
      name: String(container.name),
      image: String(container.image ?? ''),
    })),
  ];
}

export function QuickActionsMenu({
  object,
  target,
  canPatch,
  onChanged,
  variant = 'button',
  label = '变更',
}: {
  object: KubeObject;
  target: QuickTarget;
  canPatch: boolean;
  onChanged: () => void;
  variant?: 'button' | 'icon';
  label?: string;
}) {
  const [modal, setModal] = useState<ModalKind | null>(null);
  const kind = target.kind || String(object.kind ?? '');
  const containers = workloadContainers(object, kind, 'containers');
  const hasContainers = containers.length > 0;

  const items: MenuItem[] = [];
  if (supportsImageUpdate(kind) && hasContainers) {
    items.push({
      label: '更新镜像',
      icon: <Box size={14} />,
      onSelect: () => setModal('image'),
    });
  }
  if (supportsResourceUpdate(kind) && hasContainers) {
    items.push({
      label: '资源配额',
      icon: <Cpu size={14} />,
      onSelect: () => setModal('resources'),
    });
  }
  items.push({
    label: '标签与注解',
    icon: <Settings size={14} />,
    onSelect: () => setModal('metadata'),
  });
  if (kind === 'CronJob') {
    items.push({
      label: '调度设置',
      icon: <Clock size={14} />,
      onSelect: () => setModal('schedule'),
    });
  }

  if (!canPatch || items.length === 0) return null;

  const applied = () => {
    setModal(null);
    onChanged();
  };

  return (
    <>
      <Menu
        width={220}
        ariaLabel="快捷变更"
        button={
          variant === 'icon' ? (
            <button type="button" className="icon-btn" aria-label="快捷变更">
              <SlidersHorizontal size={15} />
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm quick-change-trigger">
              <WandSparkles size={14} /> {label}
            </button>
          )
        }
        items={items}
      />

      {modal === 'image' && (
        <ImageUpdateModal
          target={target}
          object={object}
          onClose={() => setModal(null)}
          onApplied={() => applied()}
        />
      )}
      {modal === 'resources' && (
        <ResourcesUpdateModal
          target={target}
          object={object}
          onClose={() => setModal(null)}
          onApplied={() => applied()}
        />
      )}
      {modal === 'metadata' && (
        <MetadataUpdateModal
          target={target}
          object={object}
          onClose={() => setModal(null)}
          onApplied={() => applied()}
        />
      )}
      {modal === 'schedule' && (
        <ScheduleUpdateModal
          target={target}
          object={object}
          onClose={() => setModal(null)}
          onApplied={() => applied()}
        />
      )}
    </>
  );
}

function useActionParams(target: QuickTarget) {
  const { cluster } = useApp();
  return {
    cluster,
    group: target.group,
    version: target.version,
    plural: target.plural,
    namespace: target.namespace,
    name: target.name,
  };
}

function ModalFooter({
  onClose,
  onSubmit,
  busy,
  disabled,
  submitLabel = '应用',
}: {
  onClose: () => void;
  onSubmit: () => void;
  busy: boolean;
  disabled?: boolean;
  submitLabel?: string;
}) {
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
        取消
      </button>
      <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={busy || disabled}>
        {busy ? <Spinner /> : null}
        {busy ? '应用中…' : submitLabel}
      </button>
    </>
  );
}

function ActionResult({
  error,
  children,
}: {
  error: string | null;
  children: ReactNode;
}) {
  return (
    <>
      {error && <div className="form-error">{error}</div>}
      {children}
    </>
  );
}

function ImageUpdateModal({
  target,
  object,
  onClose,
  onApplied,
}: {
  target: QuickTarget;
  object: KubeObject;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { notify } = useApp();
  const params = useActionParams(target);
  const kind = target.kind;
  const [entries] = useState(() => imageEntries(object, kind));
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.key, entry.image])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = entries.map((entry) => {
    const value = values[entry.key] ?? entry.image;
    return { ...entry, value };
  });
  const changed = rows.filter(
    (row) => row.value.trim() && row.value.trim() !== row.image && row.section === 'containers',
  );
  const changedInit = rows.filter(
    (row) => row.value.trim() && row.value.trim() !== row.image && row.section === 'initContainers',
  );
  const invalid = rows.some((row) => !row.value.trim() && row.value !== row.image);
  const totalChanges = changed.length + changedInit.length;

  const submit = async () => {
    if (totalChanges === 0 || invalid) return;
    setBusy(true);
    setError(null);
    try {
      await post(
        '/api/actions/image',
        {
          containers: changed.map((row) => ({ name: row.name, image: row.value.trim() })),
          initContainers: changedInit.map((row) => ({ name: row.name, image: row.value.trim() })),
        },
        params,
      );
      const suffix =
        kind === 'Pod'
          ? '，kubelet 将重启对应容器'
          : kind === 'CronJob'
            ? '，只影响之后创建的 Job'
            : '，滚动发布已触发';
      notify(`已更新 ${totalChanges} 个镜像${suffix}`, 'ok');
      onApplied();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const owner = object.metadata?.ownerReferences?.[0];

  return (
    <Modal
      open
      onClose={onClose}
      title="更新镜像"
      subtitle={`${kind} / ${target.namespace ? `${target.namespace}/` : ''}${target.name}`}
      size="lg"
      footer={
        <ModalFooter
          onClose={onClose}
          onSubmit={() => void submit()}
          busy={busy}
          disabled={totalChanges === 0 || invalid}
          submitLabel={totalChanges > 0 ? `更新 ${totalChanges} 个镜像` : '应用'}
        />
      }
    >
      <ActionResult error={error}>
        <div className="quick-warning">
          {kind === 'Pod'
            ? owner
              ? `该 Pod 由 ${owner.kind} 管理。直接改镜像可能被控制器覆盖，建议修改上层工作负载。`
              : '直接修改 Pod 镜像会重启对应容器，不会创建新的 Pod。'
            : kind === 'CronJob'
              ? '将更新 CronJob 的 Pod 模板；已创建的 Job 不会被修改。'
              : '将更新 Pod 模板并触发一次滚动发布；服务在滚动过程中保持可用。'}
        </div>

        <div className="image-editor">
          {rows.map((row) => (
            <div className="image-editor-row" key={row.key}>
              <div className="image-editor-meta">
                <div className="image-editor-title">
                  <span className="image-editor-name mono">{row.name}</span>
                  {row.section === 'initContainers' && <Badge tone="muted">init</Badge>}
                  {row.value.trim() !== row.image && <Badge tone="warn">modified</Badge>}
                </div>
                <div className="image-editor-current mono" title={row.image}>
                  {row.image || '未设置镜像'}
                </div>
              </div>
              <input
                className={classNames('input mono', !row.value.trim() && 'input-invalid')}
                value={row.value}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [row.key]: event.target.value }))
                }
                onFocus={(event) => {
                  const value = event.currentTarget.value;
                  const slash = value.lastIndexOf('/');
                  const colon = value.lastIndexOf(':');
                  if (colon > slash) event.currentTarget.setSelectionRange(colon + 1, value.length);
                }}
                placeholder="registry.example.com/app:tag"
                spellCheck={false}
                aria-label={`${row.name} 镜像`}
              />
            </div>
          ))}
        </div>
        <p className="form-hint">保留完整镜像地址与 tag；未修改的容器不会被写入 patch。</p>
      </ActionResult>
    </Modal>
  );
}

interface ResourceRowState {
  cpuRequest: string;
  cpuLimit: string;
  memoryRequest: string;
  memoryLimit: string;
}

function resourceState(container: KubeObject): ResourceRowState {
  return {
    cpuRequest: String(container.resources?.requests?.cpu ?? ''),
    cpuLimit: String(container.resources?.limits?.cpu ?? ''),
    memoryRequest: String(container.resources?.requests?.memory ?? ''),
    memoryLimit: String(container.resources?.limits?.memory ?? ''),
  };
}

function ResourcesUpdateModal({
  target,
  object,
  onClose,
  onApplied,
}: {
  target: QuickTarget;
  object: KubeObject;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { notify } = useApp();
  const params = useActionParams(target);
  const kind = target.kind;
  const [{ containers, initial }] = useState(() => {
    const list = workloadContainers(object, kind, 'containers');
    return {
      containers: list,
      initial: Object.fromEntries(
        list.map((container) => [container.name, resourceState(container)]),
      ),
    };
  });
  const [values, setValues] = useState<Record<string, ResourceRowState>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (name: string, field: keyof ResourceRowState, value: string) => {
    setValues((current) => ({
      ...current,
      [name]: { ...(current[name] ?? initial[name]), [field]: value },
    }));
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await post(
        '/api/actions/resources',
        {
          containers: containers.map((container) => {
            const row = values[container.name] ?? initial[container.name];
            return {
              name: container.name,
              requests: { cpu: row.cpuRequest, memory: row.memoryRequest },
              limits: { cpu: row.cpuLimit, memory: row.memoryLimit },
            };
          }),
        },
        params,
      );
      notify(
        kind === 'CronJob' ? '资源配额已更新，后续 Job 将使用新配置' : '资源配额已更新，滚动发布已触发',
        'ok',
      );
      onApplied();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="资源配额"
      subtitle={`${kind} / ${target.namespace ? `${target.namespace}/` : ''}${target.name}`}
      size="xl"
      footer={
        <ModalFooter
          onClose={onClose}
          onSubmit={() => void submit()}
          busy={busy}
          submitLabel="应用资源配额"
        />
      }
    >
      <ActionResult error={error}>
        <div className="quick-warning">
          修改容器 requests / limits 会触发滚动发布；请确认 QoS、调度与 HPA 行为符合预期。留空表示移除该字段。
        </div>
        <div className="resources-editor-wrap">
          <table className="resources-editor">
            <thead>
              <tr>
                <th>容器</th>
                <th>CPU 请求</th>
                <th>CPU 限制</th>
                <th>内存请求</th>
                <th>内存限制</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((container) => {
                const row = values[container.name] ?? initial[container.name];
                return (
                  <tr key={container.name}>
                    <td className="mono">{container.name}</td>
                    <td>
                      <input
                        className="input mono"
                        value={row.cpuRequest}
                        onChange={(event) => update(container.name, 'cpuRequest', event.target.value)}
                        placeholder="100m"
                        aria-label={`${container.name} CPU 请求`}
                      />
                    </td>
                    <td>
                      <input
                        className="input mono"
                        value={row.cpuLimit}
                        onChange={(event) => update(container.name, 'cpuLimit', event.target.value)}
                        placeholder="500m"
                        aria-label={`${container.name} CPU 限制`}
                      />
                    </td>
                    <td>
                      <input
                        className="input mono"
                        value={row.memoryRequest}
                        onChange={(event) => update(container.name, 'memoryRequest', event.target.value)}
                        placeholder="128Mi"
                        aria-label={`${container.name} 内存请求`}
                      />
                    </td>
                    <td>
                      <input
                        className="input mono"
                        value={row.memoryLimit}
                        onChange={(event) => update(container.name, 'memoryLimit', event.target.value)}
                        placeholder="256Mi"
                        aria-label={`${container.name} 内存限制`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="quick-modal-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setValues(initial)}
            disabled={busy}
          >
            <RotateCcw size={13} /> 恢复当前值
          </button>
        </div>
      </ActionResult>
    </Modal>
  );
}

interface MetadataRow {
  key: string;
  value: string;
}

function metadataRows(values: Record<string, string> | undefined): MetadataRow[] {
  return Object.entries(values ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, value }));
}

function MetadataEditor({
  title,
  rows,
  onChange,
  placeholderKey,
}: {
  title: string;
  rows: MetadataRow[];
  onChange: (rows: MetadataRow[]) => void;
  placeholderKey: string;
}) {
  return (
    <section className="meta-editor-section">
      <div className="meta-editor-head">
        <span className="settings-block-label">{title}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onChange([...rows, { key: '', value: '' }])}
        >
          <Plus size={13} /> 添加
        </button>
      </div>
      {rows.length === 0 && <div className="muted meta-editor-empty">暂无条目</div>}
      {rows.map((row, index) => (
        <div className="meta-editor-row" key={`${title}-${index}`}>
          <input
            className="input mono"
            value={row.key}
            onChange={(event) =>
              onChange(rows.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)))
            }
            placeholder={placeholderKey}
            aria-label={`${title}键`}
            spellCheck={false}
          />
          <input
            className="input mono"
            value={row.value}
            onChange={(event) =>
              onChange(rows.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))
            }
            placeholder="value"
            aria-label={`${title}值`}
            spellCheck={false}
          />
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            aria-label="删除条目"
          >
            <Trash size={14} />
          </button>
        </div>
      ))}
    </section>
  );
}

function MetadataUpdateModal({
  target,
  object,
  onClose,
  onApplied,
}: {
  target: QuickTarget;
  object: KubeObject;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { notify } = useApp();
  const params = useActionParams(target);
  const [labels, setLabels] = useState<MetadataRow[]>(() =>
    metadataRows(object.metadata?.labels),
  );
  const [annotations, setAnnotations] = useState<MetadataRow[]>(() =>
    metadataRows(object.metadata?.annotations),
  );
  const [initialKeys] = useState(() => ({
    labels: Object.keys(object.metadata?.labels ?? {}),
    annotations: Object.keys(object.metadata?.annotations ?? {}),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = (rows: MetadataRow[], existingKeys: string[]) => {
    const result: Record<string, string | null> = {};
    const seen = new Set<string>();
    for (const row of rows) {
      const key = row.key.trim();
      if (!key) continue;
      if (seen.has(key)) {
        throw new Error(`重复的键：${key}`);
      }
      seen.add(key);
      result[key] = row.value;
    }
    for (const key of existingKeys) {
      if (!seen.has(key)) result[key] = null;
    }
    return result;
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const labelPatch = build(labels, initialKeys.labels);
      const annotationPatch = build(annotations, initialKeys.annotations);
      await post(
        '/api/actions/metadata',
        { labels: labelPatch, annotations: annotationPatch },
        params,
      );
      notify('标签与注解已更新', 'ok');
      onApplied();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="标签与注解"
      subtitle={`${target.kind} / ${target.namespace ? `${target.namespace}/` : ''}${target.name}`}
      size="lg"
      footer={
        <ModalFooter
          onClose={onClose}
          onSubmit={() => void submit()}
          busy={busy}
          submitLabel="保存标签与注解"
        />
      }
    >
      <ActionResult error={error}>
        <div className="quick-warning">
          直接修改对象元数据，不会触发工作负载滚动发布。删除条目后保存会从对象上移除对应键。
        </div>
        <MetadataEditor
          title="Labels"
          rows={labels}
          onChange={setLabels}
          placeholderKey="app.kubernetes.io/name"
        />
        <MetadataEditor
          title="Annotations"
          rows={annotations}
          onChange={setAnnotations}
          placeholderKey="example.com/description"
        />
      </ActionResult>
    </Modal>
  );
}

function ScheduleUpdateModal({
  target,
  object,
  onClose,
  onApplied,
}: {
  target: QuickTarget;
  object: KubeObject;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { notify } = useApp();
  const params = useActionParams(target);
  const [schedule, setSchedule] = useState(String(object.spec?.schedule ?? ''));
  const [suspend, setSuspend] = useState(Boolean(object.spec?.suspend));
  const [timeZone, setTimeZone] = useState(String(object.spec?.timeZone ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!schedule.trim()) {
      setError('调度表达式不能为空');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post('/api/actions/schedule', { schedule: schedule.trim(), suspend, timeZone }, params);
      notify('CronJob 调度已更新', 'ok');
      onApplied();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="调度设置"
      subtitle={`CronJob / ${target.namespace ? `${target.namespace}/` : ''}${target.name}`}
      size="md"
      footer={
        <ModalFooter onClose={onClose} onSubmit={() => void submit()} busy={busy} submitLabel="保存调度" />
      }
    >
      <ActionResult error={error}>
        <div className="quick-warning">
          修改只影响之后创建的 Job；已经运行或已创建的 Job 不会被改动。
        </div>
        <label className="form-label" htmlFor="cron-schedule">
          Cron 表达式
        </label>
        <input
          id="cron-schedule"
          className="input mono"
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
          placeholder="*/5 * * * *"
          spellCheck={false}
        />
        <p className="form-hint">支持标准五段式表达式或 @hourly、@daily 等宏。</p>

        <label className="form-label" htmlFor="cron-timezone" style={{ marginTop: 14 }}>
          时区（可选）
        </label>
        <input
          id="cron-timezone"
          className="input mono"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          placeholder="Asia/Shanghai"
          spellCheck={false}
        />

        <label className="checkbox" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={suspend} onChange={(event) => setSuspend(event.target.checked)} />
          暂停调度（suspend）
        </label>
      </ActionResult>
    </Modal>
  );
}
