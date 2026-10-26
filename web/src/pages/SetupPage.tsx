import { CircleAlert, FolderTree, RefreshCw, Server, Terminal } from 'lucide-react';
import { Logo } from '../components/Logo';
import type { Meta } from '../types';

export function LoadingScreen({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="boot-screen">
      <div className="boot-logo">
        <Logo size={44} />
        <span className="boot-pulse" />
      </div>
      <div className="boot-label">{label}</div>
      <div className="boot-bar">
        <span />
      </div>
    </div>
  );
}

export function SetupPage({ meta, onRetry }: { meta: Meta | null; onRetry: () => void }) {
  const warnings = meta?.warnings ?? [];
  return (
    <div className="setup-screen">
      <div className="setup-glow" />
      <div className="setup-card">
        <div className="setup-brand">
          <Logo size={40} />
          <div>
            <div className="setup-name">KubeInsight</div>
            <div className="setup-tagline">轻量、零依赖的 Kubernetes 控制台</div>
          </div>
        </div>

        <div className="setup-alert">
          <CircleAlert size={18} />
          <div>
            <strong>尚未找到可用的 Kubernetes 上下文</strong>
            <p>KubeInsight 会从本机 kubeconfig 或 Pod 内的 ServiceAccount 读取集群凭证。</p>
          </div>
        </div>

        {warnings.length > 0 && (
          <ul className="setup-warnings">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        <div className="setup-steps">
          <div className="setup-step">
            <div className="setup-step-icon">
              <Terminal size={15} />
            </div>
            <div>
              <div className="setup-step-title">本地运行</div>
              <pre>
                <code>{`export KUBECONFIG=~/.kube/config\nnpm start`}</code>
              </pre>
              <p>默认监听 http://127.0.0.1:8090，可通过 --host、--port 调整。</p>
            </div>
          </div>
          <div className="setup-step">
            <div className="setup-step-icon">
              <FolderTree size={15} />
            </div>
            <div>
              <div className="setup-step-title">集群内部署</div>
              <pre>
                <code>{`kubectl apply -f deploy/kubernetes.yaml`}</code>
              </pre>
              <p>使用 ServiceAccount 和 RBAC 清单，在集群内以单副本运行。</p>
            </div>
          </div>
          <div className="setup-step">
            <div className="setup-step-icon">
              <Server size={15} />
            </div>
            <div>
              <div className="setup-step-title">挂载多个 kubeconfig</div>
              <pre>
                <code>{`docker run -p 8090:8090 \\\n  -v ~/.kube:/home/node/.kube:ro \\\n  kubeinsight`}</code>
              </pre>
              <p>支持 KUBECONFIG 多个文件与 context 切换。</p>
            </div>
          </div>
        </div>

        <div className="setup-footer">
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            <RefreshCw size={14} /> 重新检测
          </button>
          <span className="muted">挂载 kubeconfig 后重启服务即可</span>
        </div>
      </div>
    </div>
  );
}
