import { Component, type ErrorInfo, type ReactNode } from 'react';
import { tr } from '../i18n';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fatal-screen">
          <div className="fatal-card">
            <div className="fatal-title">{tr('界面出现异常')}</div>
            <p className="mono">{this.state.error.message}</p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              {tr('重新加载')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
