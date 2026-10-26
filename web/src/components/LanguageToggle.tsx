import { Globe } from 'lucide-react';
import { setLang, useLang } from '../i18n';

export function LanguageToggle({ compact }: { compact?: boolean }) {
  const lang = useLang();
  const next = lang === 'zh' ? 'en' : 'zh';
  const title = lang === 'zh' ? 'Switch to English' : '切换到中文';
  return (
    <button
      type="button"
      className={compact ? 'lang-toggle lang-toggle-compact' : 'lang-toggle'}
      onClick={() => setLang(next)}
      title={title}
      aria-label={title}
    >
      <Globe size={14} />
      <span>{lang === 'zh' ? 'EN' : '中文'}</span>
    </button>
  );
}
