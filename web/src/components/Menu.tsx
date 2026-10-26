import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { classNames } from '../lib/format';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  separator?: boolean;
}

export function Menu({
  button,
  items,
  align = 'right',
  width = 210,
  ariaLabel,
}: {
  button: ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  width?: number;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !anchorRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const reposition = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const estimatedHeight = Math.min(items.length * 36 + 12, 320);
      let top = rect.bottom + 6;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - 6);
      }
      const left =
        align === 'right'
          ? Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
          : Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setPosition({ top, left });
    }
    setOpen((value) => !value);
  };

  return (
    <>
      <span ref={anchorRef} className="menu-anchor" onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
        {button}
      </span>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="menu"
            role="menu"
            aria-label={ariaLabel}
            style={{ top: position.top, left: position.left, width }}
          >
            {items.map((item, index) =>
              item.separator ? (
                <div key={`sep-${index}`} className="menu-separator" />
              ) : (
                <button
                  key={`${item.label}-${index}`}
                  type="button"
                  role="menuitem"
                  className={classNames('menu-item', item.danger && 'menu-item-danger')}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect?.();
                  }}
                >
                  {item.icon && <span className="menu-icon">{item.icon}</span>}
                  <span className="menu-label">{item.label}</span>
                  {item.hint && <span className="menu-hint">{item.hint}</span>}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
