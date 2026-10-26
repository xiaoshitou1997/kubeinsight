# HTTP API

KubeInsight 的所有接口都在同一个进程内，默认基址 `http://127.0.0.1:8090`。前端静态资源与 API 同源，因此浏览器端不需要 CORS。

- 请求/响应均为 JSON，流式日志与 WebSocket 除外。
- 错误格式：`{"error":{"message":"...","code":"...","status":403}}`。
- 布尔参数使用 `1` / `0`，空字符串等同于未传。
- 所有 `/api/*` 都接受 `cluster`（context id）；省略时使用默认 context。

## 认证

启用 `KUBEINSIGHT_AUTH_TOKEN` 后：

```bash
# 方式一：Bearer Token
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8090/api/meta

# 方式二：先登录换取 HttpOnly Cookie
curl -c cookies.txt -X POST http://127.0.0.1:8090/api/login \
  -H 'Content-Type: application/json' \
  -d '{"token":"change-me"}'
curl -b cookies.txt http://127.0.0.1:8090/api/meta
```

未启用认证时以上鉴权头可省略。写操作还会校验 `Origin` 与 `Host` 一致（无 `Origin` 的 CLI 请求不受影响）。

## 元数据与发现

### `GET /api/meta`

集群列表、当前版本、只读/终端/认证开关、kubeconfig 来源与警告。不会返回任何证书或令牌。

### `GET /api/discovery`

返回 Discovery 归一化后的资源：

```json
{
  "cluster": "prod@cluster",
  "resources": [
    {
      "group": "apps",
      "version": "v1",
      "kind": "Deployment",
      "plural": "deployments",
      "namespaced": true,
      "verbs": ["create", "delete", "get", "list", "patch", "update", "watch"],
      "shortNames": ["deploy"],
      "categories": ["all"]
    }
  ],
  "warnings": []
}
```

`refresh=1` 强制绕过 5 分钟缓存。

### `GET /api/overview?cluster=...&namespace=...`

聚合节点、Pod、工作负载、命名空间、告警事件、资源请求与 metrics。`namespace` 只影响命名空间级资源；节点始终为全集群。

### `GET /api/health`

进程健康信息（不访问集群）。另有 `/healthz` 供探针使用。

## 资源

### `GET /api/resources`

| 参数 | 说明 |
| --- | --- |
| `group`, `version`, `plural` | GVR；也可用 `kind` 让服务端按 Discovery 解析 |
| `namespace` | 省略表示全部命名空间（命名空间级资源） |
| `labelSelector`, `fieldSelector` | 透传给 API Server |
| `limit` | 1–1000，默认 250 |
| `continue` | Kubernetes 分页 token |

返回 `{items, continue, resourceVersion, remainingItemCount, resource}`。Secret 的 `data` 会被替换为 `_keys` 与 `_masked=true`。

### `GET /api/resource`

参数：GVR + `name` + `namespace` + 可选 `reveal=1`。

返回 `{object, yaml, resource, masked, keys}`。`yaml` 已清理 `managedFields`、`status` 与 `kubectl.kubernetes.io/last-applied-configuration`，可直接编辑后回传。

### `POST /api/apply`

```json
{
  "yaml": "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: demo\n  namespace: default\n",
  "namespace": "default",
  "force": false,
  "dryRun": true
}
```

- 支持多文档与 `kind: List`；
- 使用 Server-Side Apply（`fieldManager=kubeinsight`）；
- 自动解析 `apiVersion`/`kind` 到 GVR；
- 返回 `207` 表示部分失败，逐项给出错误：

```json
{
  "ok": true,
  "results": [{"ok": true, "kind": "ConfigMap", "name": "demo", "namespace": "default"}]
}
```

### `DELETE /api/resource`

查询参数：GVR + `name` + `namespace`。可选 JSON body：

```json
{ "propagationPolicy": "Background" }
```

`propagationPolicy` 支持 `Background`、`Foreground`、`Orphan`。

### `POST /api/scale`

查询参数：GVR + `name` + `namespace`，body `{"replicas": 3}`。仅适用于暴露 `scale` 子资源的工作负载。

### `POST /api/restart`

查询参数：Deployment / StatefulSet / DaemonSet 的 GVR + `name` + `namespace`。通过更新 Pod 模板的 `kubectl.kubernetes.io/restartedAt` 注解触发滚动重启。

### `POST /api/cordon`

查询参数：`cluster`、`name`（节点名），body `{"unschedulable": true}`。

## 事件 / 指标 / 权限 / 搜索

### `GET /api/events`

参数：`namespace`、`limit`（默认 300，最大 1000）、`type=Warning|Normal`、`kind`、`name`、`q`。

事件来自 core/v1 Events，按最后发生时间倒序。

### `GET /api/metrics`

参数：`namespace`、`nodesOnly=1`。返回：

```json
{
  "available": true,
  "nodes": [{"name": "node-1", "cpuMillis": 250, "memoryBytes": 1073741824}],
  "pods": [{"namespace": "default", "name": "web-1", "cpuMillis": 10, "memoryBytes": 20971520, "containers": [...]}]
}
```

metrics-server 缺失时 `available=false`，HTTP 仍为 200。

### `GET /api/access?namespace=...`

执行 `SelfSubjectRulesReview` 与 `SelfSubjectReview`，返回当前身份、用户组、规则与归一化的 verbs 映射。UI 用它收敛按钮而非做安全边界。

### `GET /api/search?q=...`

跨 13 类常用资源做名称/命名空间子串匹配，最多返回 60 条。用于 `⌘K` 命令面板。

## 日志与终端

### `GET /api/logs`

参数：`namespace`、`pod`、`container`、`follow=1`、`previous=1`、`timestamps=1`、`tailLines`、`sinceSeconds`。

响应为 `text/plain` chunked 流，直接透传 API Server 的日志流；客户端中断时同步断开上游。

```bash
curl -N "http://127.0.0.1:8090/api/logs?namespace=default&pod=web-1&follow=1&tailLines=100"
```

### `WebSocket /api/exec`

查询参数：`cluster`、`namespace`、`pod`、`container`、`command`（可重复，默认 `/bin/sh`）、`tty=true`。

- 浏览器 → 服务端：`{"t":"input","d":"ls\r"}`、`{"t":"resize","cols":120,"rows":32}`
- 服务端 → 浏览器：`{"t":"stdout","d":"..."}`、`{"t":"stderr","d":"..."}`、`{"t":"error","message":"..."}`
- 服务端使用 `v4.channel.k8s.io` 连接 API Server，要求 Kubernetes ≥ 1.21。

## 登录 / 登出

### `POST /api/login`

Body `{"token":"..."}`。成功后设置 `ki_auth` HttpOnly Cookie（SameSite=Strict，HTTPS 下自动加 Secure）。

### `POST /api/logout`

清除 Cookie。

## 安全响应头

`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`、CSP（`default-src 'self'`，禁止内联脚本）、`frame-ancestors 'none'`。

## 常见错误

| HTTP | 含义 |
| --- | --- |
| 400 | 参数缺失或 GVR / YAML 非法 |
| 401 | 需要令牌，或 Kubernetes 凭证失效 |
| 403 | 只读模式、跨域写请求，或 RBAC 拒绝 |
| 404 | 上下文 / 资源不存在 |
| 406 | 日志/exec 上游内容协商失败（实现已处理） |
| 502 | API Server 不可达或 exec 插件失败 |
| 503 | 未配置 kubeconfig |
