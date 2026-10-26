import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ApiError, login } from '../api';
import { Logo } from '../components/Logo';

export function LoginPage({ onSuccess }: { onSuccess: () => Promise<void> | void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(token.trim());
      await onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <Logo size={36} />
          <div>
            <div className="login-name">KubeInsight</div>
            <div className="login-sub">Kubernetes 控制台</div>
          </div>
        </div>

        <div className="login-badge">
          <ShieldCheck size={14} /> 受保护的集群访问
        </div>

        <h1 className="login-title">输入访问令牌</h1>
        <p className="login-desc">
          该实例启用了共享令牌认证。请输入管理员配置的 <code>KUBEINSIGHT_AUTH_TOKEN</code>。
        </p>

        <form onSubmit={submit} className="login-form">
          <label className="login-label" htmlFor="access-token">
            访问令牌
          </label>
          <div className={`login-input ${error ? 'has-error' : ''}`}>
            <KeyRound size={16} />
            <input
              id="access-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="••••••••••••••••"
              autoFocus
              autoComplete="current-password"
              spellCheck={false}
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn btn-primary login-submit" disabled={busy || !token.trim()}>
            {busy ? '验证中…' : '进入控制台'}
            {!busy && <ArrowRight size={15} />}
          </button>
        </form>

        <div className="login-footer">
          令牌仅保存在 HttpOnly Cookie 中，不会写入浏览器存储。
        </div>
      </div>
    </div>
  );
}
