# 集群内部署说明

`deploy/kubernetes.yaml` 包含：

- Namespace `kubeinsight`
- ServiceAccount
- 示例 Secret（共享访问令牌）
- ClusterRole / ClusterRoleBinding
- Deployment（非 root、只读根文件系统、healthz 探针、64Mi 请求）
- Service（ClusterIP）
- 注释掉的 Ingress 示例

## 1. 构建并推送镜像

清单中的镜像是占位符，请替换为你的仓库：

```bash
docker build -t registry.example.com/platform/kubeinsight:0.1.0 .
docker push registry.example.com/platform/kubeinsight:0.1.0

# 修改 deploy/kubernetes.yaml 中的 image 后
kubectl apply -f deploy/kubernetes.yaml
```

也可以使用本地 kind / k3d 集群：

```bash
kind load docker-image kubeinsight:0.1.0 --name my-cluster
kubectl set image deploy/kubeinsight -n kubeinsight kubeinsight=kubeinsight:0.1.0
```

## 2. 令牌与访问

```bash
kubectl -n kubeinsight get secret kubeinsight-auth -o jsonpath='{.data.token}' | base64 -d; echo
kubectl -n kubeinsight port-forward svc/kubeinsight 8090:8090
```

打开 <http://127.0.0.1:8090>，输入令牌。**上线前请替换 Secret 中的 `change-me`**：

```bash
kubectl -n kubeinsight create secret generic kubeinsight-auth \
  --from-literal=token="$(openssl rand -hex 24)" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n kubeinsight rollout restart deploy/kubeinsight
```

## 3. RBAC

默认 ClusterRole 是「可读可写」的运维权限，覆盖常用内置资源、`pods/exec`、`pods/log` 与 metrics。它**不是** cluster-admin：

- 包含常用资源的 `delete`，但未包含 `nodes/proxy`、`pods/portforward` 等未使用的能力；
- 不包含自定义资源（CRD 实例）的访问。若要在 API Explorer 中读写 CRD，需要为对应 API Group 追加规则；
- 请按团队策略进一步收紧，尤其是 `secrets` 与 `pods/exec`。

**只读部署**：

1. 将 ClusterRole 中所有 `verbs` 改为 `["get", "list", "watch"]`（移除 `pods/exec` 规则）；
2. 在 Deployment 中增加：

```yaml
env:
  - name: KUBEINSIGHT_READ_ONLY
    value: "1"
```

只读模式会同时禁用写操作与容器终端，界面上显示「只读模式」。

## 4. 自定义资源

Discovery 会显示 CRD，但读取实例仍受 RBAC 约束。例如：

```yaml
- apiGroups: ["monitoring.coreos.com"]
  resources: ["prometheuses", "servicemonitors"]
  verbs: ["get", "list", "watch"]
```

不要在 ClusterRole 中使用 `apiGroups: ["*"]` + `resources: ["*"]`，那等价于把集群交给面板。

## 5. 高可用与状态

KubeInsight 是无状态单进程，但**不支持多副本**：

- Discovery 缓存与 exec/日志连接都是进程内的，多副本不会共享；
- 需要横向扩展时，请在前面加支持 WebSocket 的负载均衡，并接受每个副本独立缓存；
- 不建议在同一个 Deployment 中跑多个副本做「高可用」，除非你确认会话粘滞与 WebSocket 都正常。

## 6. 反向代理要点

- 必须透传 `Upgrade` / `Connection` 头，否则容器终端不可用；
- 必须支持长连接与 chunked 响应，否则日志跟随会被缓冲；
- 建议开启 HTTPS，并由代理层再做一层认证/IP 白名单；
- 代理若改写 `Host`，需要同步调整 `X-Forwarded-*`，否则写请求的同源校验可能拒绝。
