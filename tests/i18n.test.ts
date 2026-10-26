import { beforeEach, describe, expect, it } from 'vitest';
import { getLang, setLang, tr } from '../web/src/i18n';

describe('i18n', () => {
  beforeEach(() => {
    setLang('zh');
  });

  it('returns source copy in Chinese', () => {
    expect(getLang()).toBe('zh');
    expect(tr('设置')).toBe('设置');
    expect(tr('刷新')).toBe('刷新');
  });

  it('translates shared UI copy to English', () => {
    setLang('en');
    expect(getLang()).toBe('en');
    expect(tr('设置')).toBe('Settings');
    expect(tr('刷新')).toBe('Refresh');
    expect(tr('命名空间')).toBe('Namespace');
  });

  it('supports inline copy and interpolation', () => {
    setLang('en');
    expect(tr('已更新 {{count}} 个镜像', 'Updated {{count}} image(s)', { count: 2 })).toBe(
      'Updated 2 image(s)',
    );
    expect(tr('已更新 {{count}} 个镜像', 'Updated {{count}} image(s)', { count: 2 })).not.toContain(
      '{{',
    );
  });

  it('keeps Kubernetes technical strings intact', () => {
    setLang('en');
    expect(tr('Deployment')).toBe('Deployment');
    expect(tr('NodePort')).toBe('NodePort');
  });
});
