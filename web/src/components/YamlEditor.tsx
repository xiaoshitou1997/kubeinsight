import { basicSetup } from 'codemirror';
import { yaml as yamlLanguage } from '@codemirror/lang-yaml';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { Check, Copy, Download, FileCode, RotateCcw, WandSparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { parseAllDocuments } from 'yaml';
import { useApp } from '../AppContext';
import { post } from '../api';
import { tr } from '../i18n';
import { classNames } from '../lib/format';
import { Modal } from './Modal';
import { Spinner } from './ui';

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'transparent' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.7',
    overflow: 'auto',
  },
  '.cm-content': { padding: '10px 0' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-dim)',
    paddingRight: '4px',
  },
  '.cm-line': { padding: '0 14px' },
  '&.cm-focused': { outline: 'none' },
});

export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  theme = 'dark',
  height = '100%',
  className,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  theme?: 'dark' | 'light';
  height?: string;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const extensions = [
      basicSetup,
      yamlLanguage(),
      editorTheme,
      EditorView.lineWrapping,
      EditorStateReadOnly.of(readOnly),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
      }),
    ];
    if (theme === 'dark') extensions.push(oneDark);
    const view = new EditorView({
      doc: value,
      extensions,
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is intentionally re-created when theme or read-only changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={hostRef} className={classNames('code-editor', className)} style={{ height }} />;
}

// Read-only facet used by the editor extension list.
const EditorStateReadOnly = EditorState.readOnly;

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function YamlView({ value, filename }: { value: string; filename: string }) {
  const { theme } = useApp();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="yaml-view">
      <div className="yaml-toolbar">
        <span className="yaml-toolbar-title">
          <FileCode size={14} /> {filename}
        </span>
        <div className="yaml-toolbar-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? tr('已复制') : tr('复制')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => downloadText(filename, value)}
          >
            <Download size={13} /> {tr('下载')}
          </button>
        </div>
      </div>
      <CodeEditor value={value} readOnly theme={theme} height="calc(72vh - 160px)" />
    </div>
  );
}

interface ApplyResult {
  ok: boolean;
  kind?: string;
  apiVersion?: string;
  name?: string;
  namespace?: string;
  error?: { message: string; status?: number; reason?: string };
}

export function ApplyYamlModal({
  open,
  onClose,
  title,
  subtitle,
  initialYaml,
  mode = 'edit',
  templates,
  namespace,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  initialYaml: string;
  mode?: 'create' | 'edit';
  templates?: Array<{ label: string; yaml: string }>;
  namespace?: string;
  onApplied?: (results: ApplyResult[]) => void;
}) {
  const { theme, notify } = useApp();
  const [value, setValue] = useState(initialYaml);
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState(false);
  const [results, setResults] = useState<ApplyResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialYaml);
      setResults(null);
      setError(null);
      setForce(false);
    }
  }, [open, initialYaml]);

  const validate = (): string | null => {
    try {
      const docs = parseAllDocuments(value);
      for (const doc of docs) {
        if (doc.errors.length > 0) return doc.errors[0].message;
      }
      if (!value.trim()) return tr('YAML 内容为空');
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  };

  const apply = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const response = await post<{ ok: boolean; results: ApplyResult[] }>('/api/apply', {
        yaml: value,
        namespace,
        force,
      });
      setResults(response.results);
      onApplied?.(response.results);
      if (response.ok) {
        notify(mode === 'create' ? tr('资源已创建') : tr('变更已应用'), 'ok');
        onClose();
      } else {
        notify(tr('部分资源应用失败'), 'err', tr('请查看下方结果'));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const format = () => {
    try {
      const docs = parseAllDocuments(value);
      if (docs.some((doc) => doc.errors.length > 0)) {
        setError(docs.find((doc) => doc.errors.length > 0)?.errors[0]?.message ?? tr('YAML 解析失败'));
        return;
      }
      setValue(docs.map((doc) => doc.toString().trimEnd()).join('\n---\n') + '\n');
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size="xl"
      footer={
        <>
          {mode === 'create' && templates && templates.length > 0 && (
            <select
              className="select select-inline"
              value=""
              onChange={(event) => {
                const template = templates.find((item) => item.label === event.target.value);
                if (template) setValue(template.yaml);
              }}
              aria-label={tr('从模板开始')}
            >
              <option value="">{tr('从模板开始…')}</option>
              {templates.map((template) => (
                <option key={template.label} value={template.label}>
                  {template.label}
                </option>
              ))}
            </select>
          )}
          <label className="checkbox">
            <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
            {tr('强制应用冲突字段')}
          </label>
          <div className="modal-footer-spacer" />
          <button type="button" className="btn btn-ghost" onClick={format} disabled={busy}>
            <WandSparkles size={14} /> {tr('格式化')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {tr('取消')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void apply()} disabled={busy}>
            {busy ? <Spinner /> : <RotateCcw size={14} />}
            {busy ? tr('应用中…') : tr('应用')}
          </button>
        </>
      }
    >
      {error && <div className="form-error">{error}</div>}
      <div className="editor-shell">
        <CodeEditor value={value} onChange={setValue} theme={theme} height="52vh" />
      </div>
      {results && results.length > 0 && (
        <div className="apply-results">
          {results.map((result, index) => (
            <div key={index} className={classNames('apply-result', result.ok ? 'is-ok' : 'is-error')}>
              <span className="apply-result-icon">{result.ok ? <Check size={13} /> : '!'}</span>
              <span className="apply-result-name">
                {result.kind}/{result.name ?? '—'}
                {result.namespace ? ` · ${result.namespace}` : ''}
              </span>
              <span className="apply-result-message">
                {result.ok ? 'applied' : result.error?.message ?? 'failed'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
