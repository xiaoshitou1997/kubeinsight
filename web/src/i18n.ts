import { useSyncExternalStore } from 'react';

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'ki.lang';

function detectLanguage(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    /* ignore */
  }
  const browser =
    (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'zh';
  return browser.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let current: Lang = typeof window === 'undefined' ? 'zh' : detectLanguage();
const listeners = new Set<() => void>();

if (typeof document !== 'undefined') {
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
}

export function getLang(): Lang {
  return current;
}

export function setLang(next: Lang): void {
  if (next === current) return;
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
    if (
      document.title === 'KubeInsight · Kubernetes 控制台' ||
      document.title === 'KubeInsight · Kubernetes Console'
    ) {
      document.title =
        next === 'zh' ? 'KubeInsight · Kubernetes 控制台' : 'KubeInsight · Kubernetes Console';
    }
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLang(): Lang {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}

/**
 * Lightweight translation helper. Chinese is the source language; `en` can be
 * supplied inline for one-off messages, otherwise the shared dictionary is used.
 */
export function tr(zh: string, en?: string, vars?: Record<string, string | number>): string {
  let out = current === 'zh' ? zh : (en ?? EN[zh] ?? zh);
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      out = out.split(`{{${key}}}`).join(String(value));
    }
  }
  return out;
}

const EN: Record<string, string> = {
  // Shell / navigation
  概览: 'Overview',
  工作负载: 'Workloads',
  网络: 'Networking',
  配置: 'Configuration',
  存储: 'Storage',
  集群: 'Cluster',
  访问控制: 'Access control',
  事件: 'Events',
  设置: 'Settings',
  已连接: 'Connected',
  离线: 'Offline',
  '集群与访问设置': 'Cluster & access',
  '打开导航': 'Open navigation',
  '切换集群': 'Switch cluster',
  '当前身份': 'Current identity',
  '设置与权限': 'Settings & access',
  '退出登录': 'Sign out',
  '切换到浅色主题': 'Switch to light theme',
  '切换到深色主题': 'Switch to dark theme',
  '搜索资源': 'Search resources',
  '全部命名空间': 'All namespaces',
  '切换命名空间': 'Switch namespace',
  '自动刷新设置': 'Auto-refresh',
  '关闭自动刷新': 'Auto-refresh off',
  '每 5 秒': 'Every 5s',
  '每 10 秒': 'Every 10s',
  '每 30 秒': 'Every 30s',
  '立即刷新': 'Refresh now',
  '当前': 'Current',
  '手动': 'Manual',
  '只读模式': 'Read-only',
  '用户菜单': 'User menu',
  '未识别身份': 'Unknown identity',
  '切换主题': 'Toggle theme',
  '更深色主题': 'Dark theme',
  '刷新': 'Refresh',
  '刷 新': 'Refresh',
  '返回概览': 'Back to overview',
  '页面不存在': 'Page not found',
  '这个地址没有对应的资源视图。': 'There is no resource view at this address.',
  '重新加载': 'Reload',
  '界面出现异常': 'Something went wrong',
  '关闭通知': 'Dismiss notification',
  '未知错误': 'Unknown error',
  '请求失败': 'Request failed',
  '重试': 'Retry',
  '加载中': 'Loading',
  '加载中…': 'Loading…',
  '暂无资源': 'No resources',
  '加载更多': 'Load more',
  '关闭': 'Close',
  '取消': 'Cancel',
  '应用': 'Apply',
  '保存': 'Save',
  '删除': 'Delete',
  '重命名': 'Rename',
  '复制': 'Copy',
  '已复制': 'Copied',
  '下载': 'Download',
  '显示明文': 'Reveal values',
  '明文模式': 'Plaintext',
  '是': 'Yes',
  '否': 'No',
  '操作': 'Actions',
  '状态': 'Status',
  '名称': 'Name',
  '类型': 'Type',
  '原因': 'Reason',
  '消息': 'Message',
  '时间': 'Time',
  '更新时间': 'Updated',
  '当前值': 'Current',

  // Detail labels
  '元数据': 'Metadata',
  '命名空间': 'Namespace',
  '集群级': 'Cluster-scoped',
  '创建时间': 'Created',
  '存活时间': 'Age',
  'UID': 'UID',
  '资源版本': 'Resource version',
  '所有者': 'Owner',
  '终结器': 'Finalizers',
  '标签与注解': 'Labels & annotations',
  '标签': 'Labels',
  '注解': 'Annotations',
  '状态条件': 'Conditions',
  '卷': 'Volumes',
  '污点': 'Taints',
  '容器': 'Containers',
  '就绪': 'Ready',
  '重启': 'Restarts',
  '重启次数': 'Restarts',
  '镜像': 'Image',
  '资源请求 / 限制': 'Requests / limits',
  '资源': 'Resource',
  '容量': 'Capacity',
  '可分配': 'Allocatable',
  '容量与可分配': 'Capacity & allocatable',
  '节点状态': 'Node status',
  '节点': 'Node',
  '角色': 'Roles',
  '内部 IP': 'Internal IP',
  'Kubelet': 'Kubelet',
  '操作系统': 'OS',
  '容器运行时': 'Container runtime',
  '可调度': 'Schedulable',
  '已封锁': 'Cordoned',
  'CPU 已用': 'CPU used',
  '内存已用': 'Memory used',
  'CPU / 内存': 'CPU / memory',
  '服务账号': 'Service account',
  '重启策略': 'Restart policy',
  '主机 IP': 'Host IP',
  '优先级类': 'Priority class',
  '运行阶段': 'Phase',
  '开始时间': 'Started',
  'Pod 状态': 'Pod status',
  '就绪容器': 'Ready containers',
  '期望副本': 'Desired replicas',
  '已更新': 'Updated',
  '可用': 'Available',
  '策略': 'Strategy',
  '选择器': 'Selector',
  '修订版本': 'Revision',
  '最小就绪': 'Min ready',
  '修订历史': 'Revision history',
  '服务': 'Service',
  '外部 IP': 'External IP',
  '会话亲和': 'Session affinity',
  '负载均衡 IP': 'Load balancer IP',
  '端口': 'Port',
  '目标端口': 'Target port',
  'NodePort': 'NodePort',
  '协议': 'Protocol',
  '路由规则': 'Routing rules',
  '负载均衡地址': 'Load balancer',
  '后端服务': 'Backend service',
  '配置项': 'Data',
  '密钥数据': 'Secret data',
  '存储类': 'Storage class',
  '绑定模式': 'Binding mode',
  '允许扩容': 'Allow expansion',
  '回收策略': 'Reclaim policy',
  '参数': 'Parameters',
  '自动扩缩容': 'Autoscaling',
  '当前副本': 'Current replicas',
  '最小 / 最大': 'Min / max',
  '目标': 'Target',
  '指标': 'Metric',
  '定时任务': 'CronJob',
  '调度表达式': 'Schedule',
  '时区': 'Time zone',
  '挂起': 'Suspend',
  '并发策略': 'Concurrency policy',
  '上次调度': 'Last schedule',
  '活跃 Job': 'Active jobs',
  '任务': 'Job',
  '完成数': 'Completions',
  '并行度': 'Parallelism',
  '重试上限': 'Backoff limit',
  '完成时间': 'Completion time',
  '活跃 Pod': 'Active pods',
  '定义': 'Definition',
  '复数形式': 'Plural',
  '作用域': 'Scope',
  '转换策略': 'Conversion',
  '存储版本': 'Storage version',
  '版本': 'Version',
  '权限规则': 'Rules',
  '绑定关系': 'Binding',
  '角色引用': 'Role reference',
  '主体数量': 'Subjects',
  '根据当前信息无法识别': 'Unable to determine',

  // Pod / Node values
  '运行中': 'Running',
  '等待中': 'Pending',
  '已完成': 'Completed',
  '失败': 'Failed',
  '未就绪': 'Not ready',
  '已终止': 'Terminated',
  '未知': 'Unknown',
  '全部': 'All',
  '全部 Pods': 'All pods',
  '事件中心': 'Events',
  '最近告警事件': 'Recent warnings',
  '最近告警': 'Recent warnings',
  '需要关注': 'Attention needed',
  '节点就绪': 'Nodes ready',
  '运行中的 Pod': 'Running pods',
  '工作负载就绪': 'Workloads ready',
  '资源压力': 'Resource pressure',
  'Pod 分布': 'Pod distribution',
  '工作负载健康度': 'Workload health',
  '命名空间分布': 'Namespace distribution',
  '全部节点可调度': 'All nodes are schedulable',
  '个节点已封锁': 'nodes cordoned',
  '个未达标': 'not ready',
  '等待': 'pending',
  '未就绪容器': 'not ready',
  '次重启': 'restarts',
  '已用': 'used',
  '请求': 'requests',
  '已用 · 请求': 'used · requests',
  'CPU 使用率': 'CPU usage',
  '内存使用率': 'Memory usage',
  '上次': 'last',
  '更新于': 'updated',
  '每 {{seconds}}s 自动刷新': 'Auto-refresh every {{seconds}}s',
  '手动刷新': 'Manual refresh',
  '全部事件': 'All events',
  '平均': 'avg',
  '封锁': 'cordoned',
  '可用区': 'zone',
  '创建': 'Create',
  '创建资源': 'Create resource',
  '查看全部': 'View all',
  '没有发现异常': 'No issues found',
  '所有 Pod 与工作负载处于健康状态。': 'All pods and workloads are healthy.',
  '全部 Deployment 已就绪': 'All Deployments are ready',
  '当前范围内没有未达标的副本。': 'No unavailable replicas in this scope.',
  '当前没有告警事件。': 'No warning events right now.',
  '当前没有事件': 'No events right now',
  '当前没有': 'No',

  // Events
  '按名称过滤…': 'Filter by name…',
  '搜索原因、消息或对象…': 'Search reason, message or object…',
  '点击事件行可打开关联资源': 'Click an event to open the related resource',
  '涉及对象': 'Objects',
  '没有匹配的事件': 'No matching events',
  '尝试调整关键字或切换事件类型。': 'Try a different keyword or event type.',
  '集群近期没有产生 Warning 或 Normal 事件。': 'No Warning or Normal events have been recorded recently.',
  '按类型过滤': 'Filter by type',
  '只读模式已禁用终端': 'Terminal is disabled in read-only mode',
  '服务端已禁用 exec': 'Exec is disabled by the server',
  '当前 Pod 不在 Running 状态': 'Pod is not Running',

  // Settings
  '集群连接': 'Cluster connection',
  '集群列表': 'Clusters',
  '个上下文': 'contexts',
  '集群列表来自服务端 KUBECONFIG，KubeInsight 不会把证书或 Token 发送到浏览器。':
    'Clusters come from the server-side KUBECONFIG. KubeInsight never sends certificates or tokens to the browser.',
  '客户端证书': 'Client certificate',
  'Bearer Token': 'Bearer token',
  'Exec 凭证插件': 'Exec credential plugin',
  'Basic Auth': 'Basic auth',
  '匿名': 'Anonymous',
  '默认命名空间': 'Default namespace',
  '跳过 TLS 校验': 'TLS verification disabled',
  '当前实例': 'Current instance',
  '集群管理员': 'Cluster admin',
  '受限权限': 'Limited permissions',
  '未识别（SelfSubjectReview 不可用）': 'Unknown (SelfSubjectReview unavailable)',
  '规则评估命名空间': 'Rules evaluated for namespace',
  '资源规则': 'Resource rules',
  '通配动词': 'Wildcard verbs',
  '用户组': 'Groups',
  '只读': 'Read-only',
  '界面偏好': 'Appearance',
  '主题': 'Theme',
  '深色': 'Dark',
  '浅色': 'Light',
  '跟随系统': 'System',
  '自动刷新': 'Auto-refresh',
  '5 秒': '5s',
  '10 秒': '10s',
  '30 秒': '30s',
  '所有列表、概览与事件会按该间隔静默刷新；切换页面立即生效。':
    'Lists, overview and events are refreshed silently at this interval.',
  '终端与写操作': 'Terminal and writes',
  '容器终端': 'Container terminal',
  '已禁用': 'Disabled',
  '写操作（创建 / 修改 / 删除）': 'Writes (create / update / delete)',
  '运行信息': 'Runtime',
  '在线': 'Live',
  '共享令牌认证': 'Shared-token auth',
  '已启用': 'Enabled',
  '未启用': 'Disabled',
  '运行时': 'Runtime',
  '启动时间': 'Started',
  '快捷键': 'Shortcuts',
  '打开资源搜索': 'Open search',
  '打开选中的结果': 'Open selected result',
  '关闭抽屉 / 弹窗': 'Close drawer / dialog',
  '重新加载元数据': 'Reload metadata',
  '查看文档': 'Documentation',
  '登录': 'Sign in',
  '访问令牌': 'Access token',
  '输入访问令牌': 'Enter access token',
  '进入控制台': 'Open console',
  '验证中…': 'Verifying…',
  '令牌仅保存在 HttpOnly Cookie 中，不会写入浏览器存储。':
    'The token is stored only in an HttpOnly cookie, never in browser storage.',
  '受保护的集群访问': 'Protected cluster access',
  '该实例启用了共享令牌认证。请输入管理员配置的 KUBEINSIGHT_AUTH_TOKEN。':
    'This instance uses shared-token auth. Enter the KUBEINSIGHT_AUTH_TOKEN configured by the administrator.',
  '无效的访问令牌': 'Invalid access token',
  '登录失败': 'Sign-in failed',

  // Setup
  '尚未找到可用的 Kubernetes 上下文': 'No Kubernetes context found',
  'KubeInsight 会从本机 kubeconfig 或 Pod 内的 ServiceAccount 读取集群凭证。':
    'KubeInsight reads credentials from the local kubeconfig or the in-cluster ServiceAccount.',
  '本地运行': 'Run locally',
  '默认监听 http://127.0.0.1:8090，可通过 --host、--port 调整。':
    'Listens on http://127.0.0.1:8090 by default; use --host / --port to change it.',
  '集群内部署': 'Deploy in cluster',
  '使用 ServiceAccount 和 RBAC 清单，在集群内以单副本运行。':
    'Run as a single replica using the ServiceAccount and RBAC manifests.',
  '挂载多个 kubeconfig': 'Mount multiple kubeconfigs',
  '支持 KUBECONFIG 多个文件与 context 切换。':
    'Supports multiple kubeconfig files and context switching.',
  '重新检测': 'Check again',
  '挂载 kubeconfig 后重启服务即可': 'Mount a kubeconfig and restart the service',
  '正在连接 Kubernetes 集群…': 'Connecting to Kubernetes…',
  '无法启动控制台': 'Cannot start console',
  '正在连接…': 'Connecting…',
  '无法加载集群信息': 'Cannot load cluster information',

  // Quick actions
  '变更': 'Change',
  '快捷变更': 'Quick actions',
  '更新镜像': 'Update image',
  '资源配额': 'Resource limits',
  '调度设置': 'Schedule',
  '镜像已更新': 'Image updated',
  '资源配额已更新': 'Resource limits updated',
  '标签与注解已更新': 'Labels & annotations updated',
  '调度已更新': 'Schedule updated',
  '更新 {{count}} 个镜像': 'Update {{count}} image(s)',
  '保留完整镜像地址与 tag；未修改的容器不会被写入 patch。':
    'Keep the full image reference and tag. Unchanged containers are not patched.',
  '应用资源配额': 'Apply resource limits',
  '保存标签与注解': 'Save labels & annotations',
  '保存调度': 'Save schedule',
  '恢复当前值': 'Reset to current',
  '暂无条目': 'No entries yet',
  '添加': 'Add',
  '删除条目': 'Remove entry',
  'CPU 请求': 'CPU request',
  'CPU 限制': 'CPU limit',
  '内存请求': 'Memory request',
  '内存限制': 'Memory limit',
  'Cron 表达式': 'Cron expression',
  '时区（可选）': 'Time zone (optional)',
  '暂停调度（suspend）': 'Suspend schedule',
  '支持标准五段式表达式或 @hourly、@daily 等宏。':
    'Use a five-field cron expression or macros like @hourly / @daily.',
  '修改容器 requests / limits 会触发滚动发布；请确认 QoS、调度与 HPA 行为符合预期。留空表示移除该字段。':
    'Changing requests / limits triggers a rollout. Check QoS, scheduling and HPA behavior. Empty removes the field.',
  '直接修改对象元数据，不会触发工作负载滚动发布。删除条目后保存会从对象上移除对应键。':
    'Metadata changes do not trigger a rollout. Removed rows are deleted from the object when saved.',
  '修改只影响之后创建的 Job；已经运行或已创建的 Job 不会被改动。':
    'Only future Jobs are affected; existing Jobs are not changed.',
  '将更新 Pod 模板并触发一次滚动发布；服务在滚动过程中保持可用。':
    'Updates the Pod template and triggers a rolling update. The service stays available during the rollout.',
  '直接修改 Pod 镜像会重启对应容器，不会创建新的 Pod。':
    'Updating a Pod image restarts its containers; no new Pod is created.',
  '将更新 CronJob 的 Pod 模板；已创建的 Job 不会被修改。':
    'Updates the CronJob Pod template; existing Jobs are not modified.',
  '该 Pod 由 {{kind}} 管理。直接改镜像可能被控制器覆盖，建议修改上层工作负载。':
    'This Pod is managed by {{kind}}. Direct image changes may be reverted by the controller; edit the workload instead.',
  '请确认': 'Please confirm',
  '更新': 'Update',

  // Notifications
  '已复制名称': 'Name copied',
  '复制失败，请手动选择': 'Copy failed; select manually',
  '已请求显示明文，编辑时请谨慎操作': 'Reveal requested. Handle the plaintext carefully.',
  '名称已复制': 'Name copied',
  '节点已封锁': 'Node cordoned',
  '节点已恢复调度': 'Node uncordoned',
  '已删除': 'Deleted',
  '删除成功': 'Deleted',
  '滚动重启': 'Rolling restart',
  '已触发滚动重启': 'Rolling restart triggered',
  '已更新 {{count}} 个镜像，滚动发布已触发': 'Updated {{count}} image(s); rolling update triggered',
  '已更新 {{count}} 个镜像，kubelet 将重启对应容器': 'Updated {{count}} image(s); kubelet will restart the containers',
  '已更新 {{count}} 个镜像，只影响之后创建的 Job': 'Updated {{count}} image(s); applies to future Jobs',

  // Drawer / tabs
  '正在读取对象…': 'Loading object…',
  '正在读取对象': 'Loading object',
  '对象不存在': 'Object not found',
  '它可能已被删除或没有访问权限。': 'It may have been deleted or you may not have access.',
  '详情标签页': 'Detail tabs',
  '更多操作': 'More actions',
  '关闭详情': 'Close details',
  '关闭错误': 'Dismiss error',
  '编辑': 'Edit',
  '编辑 YAML': 'Edit YAML',
  '调整副本数': 'Adjust replicas',
  '期望副本数': 'Desired replicas',
  '级联策略': 'Cascade policy',
  '此操作不可撤销。级联删除会同时清理其管理的 Pod；集群级对象可能影响多个命名空间。':
    'This cannot be undone. Cascading deletion also removes managed Pods; cluster-scoped objects may affect multiple namespaces.',
  '重启 {{kind}}？': 'Restart {{kind}}?',
  '将更新 Pod 模板的 restartedAt 注解，触发一次滚动重启。服务在滚动过程中保持可用。':
    'Updates the restartedAt annotation on the Pod template to trigger a rolling restart. The service stays available.',
  '删除 {{kind}} {{name}}？': 'Delete {{kind}} {{name}}?',
  'Background（推荐）': 'Background (recommended)',
  'Foreground（等待级联完成）': 'Foreground (wait for cascade)',
  '扩缩容': 'Scale',
  '伸缩': 'Scale',
  '封锁节点': 'Cordon node',
  '恢复调度': 'Uncordon',
  '复制名称': 'Copy name',
  '秒': 's',
  '个副本': 'replicas',

  // Logs / terminal
  '过滤日志': 'Filter logs',
  '时间戳': 'Timestamps',
  '上一次': 'Previous',
  '日志行数': 'Log lines',
  '实时': 'Live',
  '已暂停': 'Paused',
  '实时流': 'Live',
  '连接中': 'Connecting',
  '已结束': 'Ended',
  '错误': 'Error',
  '回到底部': 'Back to bottom',
  '正在读取日志…': 'Loading logs…',
  '暂无日志输出': 'No log output',
  '下载日志': 'Download logs',
  '自动换行': 'Wrap',
  '取消自动换行': 'No wrap',
  '日志请求失败': 'Log request failed',
  '终端不可用': 'Terminal unavailable',
  '连接终端': 'Connect terminal',
  '选择 Shell': 'Choose shell',
  '连接错误': 'Connection error',
  '已断开': 'Disconnected',
  '重新连接': 'Reconnect',
  '清屏': 'Clear',
  '断开连接': 'Disconnect',
  '正在连接容器终端…': 'Connecting to container terminal…',
  '终端通过 Kubernetes exec API 建立，命令以当前 kubeconfig 身份执行。调整窗口大小会自动同步终端尺寸。':
    'The terminal uses the Kubernetes exec API with the current kubeconfig identity. Resizing the window syncs the terminal size.',
  '当前实例运行在只读模式，容器终端已禁用。': 'This instance is read-only; the container terminal is disabled.',
  '服务端通过 --no-exec 禁用了容器终端。': 'The server disabled the container terminal with --no-exec.',
  'Pod 当前处于 {{phase}} 状态，无法启动终端。': 'The Pod is in {{phase}} state; the terminal cannot start.',
  'Secret 内容已脱敏': 'Secret values are masked',
  '为了避免密钥进入浏览器内存，默认不返回 data 字段。显示明文后可查看与编辑。':
    'The data field is omitted by default to keep secrets out of browser memory. Reveal to view or edit.',
  '内容已脱敏，显示明文需要权限并会记录在审计日志中':
    'Values are masked. Revealing requires permission and is recorded in the audit log.',
  '明文已显示，请谨慎操作': 'Plaintext is visible; handle it carefully.',
  '共 {{count}} 个键': '{{count}} keys',
  '没有数据': 'No data',
  '终结器：': 'Finalizers:',
  '被声明引用：': 'Claimed by:',
  '来源': 'Source',
  '开始': 'Started',
  '值': 'Value',
  '键': 'Key',
  '操作失败': 'Action failed',
  '处理中…': 'Working…',
  '应用中…': 'Applying…',
  '确认': 'Confirm',
  '确认删除': 'Delete',
  '格式化': 'Format',
  '从模板开始…': 'Start from a template…',
  '强制应用冲突字段': 'Force apply on conflicts',
  '应用资源': 'Apply',
  'YAML 内容为空': 'YAML is empty',
  '部分资源应用失败': 'Some resources failed',
  '请查看下方结果': 'Check the results below',
  '资源已创建': 'Resources created',
  '变更已应用': 'Changes applied',
  '请求超时或已取消': 'Request timed out or was cancelled',
  '无法连接到 KubeInsight 服务': 'Cannot reach KubeInsight',
  '当前命名空间': 'Current namespace',
  '未调度': 'Unscheduled',
  '刚刚': 'just now',

  // Additional UI copy
  '，滚动发布已触发': '; rolling update triggered',
  '，只影响之后创建的 Job': '; applies to future Jobs',
  '，kubelet 将重启对应容器': '; kubelet will restart the containers',
  '{{count}} 个': '{{count}}',
  '{{count}} 个键': '{{count}} keys',
  '{{count}} 个节点已封锁': '{{count}} node(s) cordoned',
  '{{count}} 重启': '{{count}} restarts',
  '{{name}} 镜像': '{{name}} image',
  '{{name}} 内存请求': '{{name}} memory request',
  '{{name}} 内存限制': '{{name}} memory limit',
  '{{name}} CPU 请求': '{{name}} CPU request',
  '{{name}} CPU 限制': '{{name}} CPU limit',
  '{{ready}}/{{total}} 个节点上报指标': '{{ready}}/{{total}} nodes reporting',
  '{{title}}键': '{{title}} key',
  '{{title}}值': '{{title}} value',
  '200 行': '200 lines',
  '500 行': '500 lines',
  '2000 行': '2000 lines',
  '5000 行': '5000 lines',
  '按 Cron 表达式周期性地创建 Job。': 'Creates Jobs on a cron schedule.',
  绑定卷: 'Bound volume',
  '保存密码、令牌与证书等敏感数据，默认脱敏展示。':
    'Stores sensitive data such as passwords, tokens and certificates; masked by default.',
  '查看的是实时集群数据；删除、伸缩等写操作会以当前 kubeconfig 身份直接作用于集群。':
    'You are viewing live cluster data. Writes are made directly with the current kubeconfig identity.',
  '查看上一个已终止容器的日志': 'View logs from the previous terminated container',
  从模板开始: 'Start from template',
  打开: 'Open',
  '单进程 · 无数据库 · 无 Agent': 'Single process · no database · no agent',
  '当前副本：': 'Current replicas: ',
  '当前浏览器不支持流式日志': 'This browser does not support streaming logs',
  '当前视图为全部命名空间。': 'The current view is all namespaces.',
  导航: 'Navigation',
  '调度表达式不能为空': 'The schedule expression is required',
  '定义存储的供给方式、回收策略与绑定模式。':
    'Defines storage provisioning, reclaim policy and binding mode.',
  '读取集群状态失败': 'Failed to read cluster status',
  短名: 'Short names',
  访问模式: 'Access modes',
  '副本数必须是非负整数': 'Replicas must be a non-negative integer',
  '该操作不可撤销。级联删除会同时清理其管理的 Pod；集群级对象可能影响多个命名空间。':
    'This cannot be undone. Cascading deletion also removes managed Pods; cluster-scoped objects may affect multiple namespaces.',
  '该对象没有可用的 label selector。': 'This object has no usable label selector.',
  '该实例启用了共享令牌认证。请输入管理员配置的': 'This instance uses shared-token auth. Enter the configured',
  '该资源类型下暂无对象。': 'There are no objects of this type.',
  个对象: 'objects',
  个资源类型: 'resource types',
  '根据 CPU、内存或自定义指标自动扩缩容工作负载。':
    'Automatically scales workloads based on CPU, memory or custom metrics.',
  共: 'of',
  '关联的 Pods': 'Related Pods',
  管理: 'Manage',
  '规则列表不完整（规则数量超过服务端限制），部分操作可能被错误展示。':
    'The rule list is incomplete (it exceeds the server limit); some actions may be shown incorrectly.',
  '基于主机名与路径将外部流量路由到集群服务。':
    'Routes external traffic to cluster services by host and path.',
  '集群 API 当前不可达': 'Cluster API is unreachable',
  '集群、身份与偏好': 'Cluster, identity and preferences',
  '集群的工作节点，查看资源压力、污点与调度状态。':
    'Worker nodes with resource pressure, taints and scheduling state.',
  集群概览: 'Cluster overview',
  '集群级别的存储资源，独立于任何命名空间。':
    'Cluster-scoped storage resources, independent of any namespace.',
  '集群级别的权限规则集合。': 'Cluster-scoped permission rules.',
  集群级资源: 'Cluster-scoped resources',
  '集群连接、当前身份、界面偏好与运行信息。':
    'Cluster connection, current identity, appearance and runtime information.',
  集群事件流: 'Cluster event stream',
  '集群中运行的最小调度单元，查看状态、日志与容器终端。':
    'The smallest scheduling unit in the cluster; inspect status, logs and a container terminal.',
  '集群资源的逻辑隔离单元。': 'Logical isolation for cluster resources.',
  继续实时日志: 'Resume live logs',
  '将 Role 绑定到用户、组或 ServiceAccount。':
    'Binds a Role to users, groups or ServiceAccounts.',
  '节点、Pod、事件与资源压力': 'Nodes, Pods, events and resource pressure',
  '节点可调度的 Pod 上限': 'Maximum Pods schedulable on the node',
  节点列表: 'Node list',
  界面语言: 'Interface language',
  镜像拉取密钥: 'Image pull secrets',
  '可分配 CPU': 'Allocatable CPU',
  可分配内存: 'Allocatable memory',
  '扩展 Kubernetes API 的自定义资源定义。':
    'Custom resource definitions that extend the Kubernetes API.',
  连接已关闭: 'Connection closed',
  '浏览全部 API 资源与 CRD': 'Browse all API resources and CRDs',
  没有规则: 'No rules',
  '没有匹配的 API 资源': 'No matching API resources',
  '没有匹配的 Pod': 'No matching Pods',
  没有找到实例: 'No instances found',
  '命名空间级别的权限规则集合。': 'Namespace-scoped permission rules.',
  '默认跟随浏览器语言；此选择会保存在本机浏览器中。':
    'Defaults to the browser language; this choice is saved in this browser.',
  '默认跟随系统；也可以固定为浅色或深色。系统主题变化会实时同步。':
    'Follows the system by default, or can be fixed to light or dark. System changes are applied live.',
  内存: 'Memory',
  配置提示: 'Configuration notice',
  匹配: 'matching',
  '轻量、零依赖的 Kubernetes 控制台': 'A lightweight, dependency-free Kubernetes console',
  清除: 'Clear',
  '请检查 kubeconfig、网络连通性与 API Server 证书。':
    'Check the kubeconfig, network connectivity and API Server certificate.',
  '确保每个（或指定）节点上都运行一个 Pod 副本。':
    'Ensures one Pod replica runs on every node, or on selected nodes.',
  日志: 'Logs',
  终端: 'Terminal',
  '筛选命名空间 {{namespace}}': 'Filter by namespace {{namespace}}',
  '声明式管理无状态应用的副本、滚动发布与回滚。':
    'Declaratively manages replicas, rolling updates and rollbacks for stateless apps.',
  事件类型: 'Event type',
  '搜索 Kind、资源名或 API 组…': 'Search Kind, resource or API group…',
  '搜索跨命名空间的 Pod、Deployment、Service、Node…':
    'Search Pods, Deployments, Services, Nodes across namespaces…',
  条: 'items',
  '维护一组同构 Pod 的副本数量，通常由 Deployment 管理。':
    'Maintains a replica count for a set of identical Pods, usually managed by a Deployment.',
  '为 Pod 提供访问 API Server 的身份。': 'Provides an identity for Pods to access the API Server.',
  '为命名空间内的容器设置默认与最大资源限制。':
    'Sets default and maximum resource limits for containers in a namespace.',
  '为一组 Pod 提供稳定的虚拟 IP 与负载均衡。':
    'Provides a stable virtual IP and load balancing for a group of Pods.',
  '为有状态应用提供稳定的网络标识与持久化存储。':
    'Provides stable network identity and persistent storage for stateful apps.',
  未设置镜像: 'No image set',
  '无法确定关联的 Pod': 'Cannot determine related Pods',
  '限制命名空间内的资源总量与对象数量。':
    'Limits total resources and object counts within a namespace.',
  项: 'items',
  选择: 'Select',
  选择集群: 'Select cluster',
  选择容器: 'Select container',
  '选择一个 API 资源': 'Select an API resource',
  '以键值对形式保存非敏感配置。': 'Stores non-sensitive configuration as key-value pairs.',
  '应用对持久化存储的请求，绑定后可供 Pod 挂载。':
    'A request for persistent storage that can be mounted by Pods once bound.',
  语言: 'Language',
  '运行一次性的批处理任务，直到成功完成指定次数。':
    'Runs a one-off batch task until it completes successfully the specified number of times.',
  '在 YAML 中指定命名空间': 'Specify the namespace in the YAML',
  '在集群范围内授予 ClusterRole 权限。': 'Grants ClusterRole permissions cluster-wide.',
  '在自愿中断（如节点维护）期间保证最小可用副本数。':
    'Guarantees a minimum number of available replicas during voluntary disruptions such as node maintenance.',
  暂停实时日志: 'Pause live logs',
  暂无事件: 'No events',
  '正在汇总节点、工作负载与事件…': 'Summarizing nodes, workloads and events…',
  '正在搜索集群资源…': 'Searching cluster resources…',
  '支持跨命名空间模糊匹配': 'Fuzzy search across namespaces',
  '直接浏览集群发现的所有 API 资源，包括 CRD 与聚合 API；适用于排查自定义资源。':
    'Browse every API resource discovered by the cluster, including CRDs and aggregated APIs; useful for custom resources.',
  '只读模式禁用': 'Disabled in read-only mode',
  终端错误: 'Terminal error',
  重新发现: 'Rediscover',
  主导航: 'Main navigation',
  '资源配额已更新，滚动发布已触发': 'Resource limits updated; rolling update triggered',
  '资源配额已更新，后续 Job 将使用新配置':
    'Resource limits updated; future Jobs will use the new configuration',
  资源搜索: 'Resource search',
  自动刷新间隔: 'Auto-refresh interval',
  总重启: 'Total restarts',
  '左侧列出了集群发现的全部资源类型。选择后可浏览实例并打开详情。':
    'The left panel lists every resource type discovered by the cluster. Select one to browse instances and open details.',
  'CronJob 调度已更新': 'CronJob schedule updated',
  'KubeInsight 首页': 'KubeInsight home',
  'Kubernetes 控制台': 'Kubernetes console',
  'Kubernetes 事件默认保留 1 小时；告警事件通常指向调度失败、镜像拉取或探针异常。':
    'Kubernetes events are retained for one hour by default; warnings usually point to scheduling, image pull or probe failures.',
  'Kubernetes 事件默认只保留 1 小时。': 'Kubernetes events are retained for one hour by default.',
  'metrics-server 不可用，实时使用率无法展示（容量与分配仍可查看）。':
    'metrics-server is unavailable; live usage is hidden, but capacity and allocation remain visible.',
  'metrics-server 不可用，展示调度请求量': 'metrics-server unavailable; showing scheduling requests',
  'Pod 阶段分布': 'Pod phase distribution',
  'Secrets 数量': 'Secrets count',
  'Service 背后实际就绪的 Pod 端点。': 'The actually ready Pod endpoints behind a Service.',
  'WebSocket 连接失败': 'WebSocket connection failed',
  'YAML 解析失败': 'Failed to parse YAML',
  '凭证仅在服务端内存中使用；所有请求通过当前 kubeconfig 身份直接访问 API Server，KubeInsight 不持久化任何集群数据。':
    'Credentials are used only in server memory. All requests use the current kubeconfig identity against the API Server; KubeInsight persists no cluster data.',
};