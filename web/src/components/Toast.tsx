import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useApp } from '../AppContext';
import { tr } from '../i18n';
import { classNames } from '../lib/format';

export function ToastViewport() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return createPortal(
    <div className="toast-viewport" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={classNames('toast', `toast-${toast.tone}`)}>
          <span className="toast-icon">
            {toast.tone === 'ok' ? (
              <CircleCheck size={16} />
            ) : toast.tone === 'err' ? (
              <CircleAlert size={16} />
            ) : (
              <Info size={16} />
            )}
          </span>
          <div className="toast-content">
            <div className="toast-message">{toast.message}</div>
            {toast.detail && <div className="toast-detail">{toast.detail}</div>}
          </div>
          <button type="button" className="toast-close" onClick={() => dismissToast(toast.id)} aria-label={tr('关闭通知')}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
