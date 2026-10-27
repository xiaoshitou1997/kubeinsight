import { describe, expect, it } from 'vitest';
import { ensureTypeMeta } from '../server/src/api/shared.js';

const deployment = {
  kind: 'Deployment',
  group: 'apps',
  version: 'v1',
};

describe('list item type metadata', () => {
  it('adds kind and groupVersion to list items', () => {
    const item: Record<string, any> = { metadata: { name: 'web' } };
    expect(ensureTypeMeta(item, deployment)).toMatchObject({
      kind: 'Deployment',
      apiVersion: 'apps/v1',
    });
  });

  it('uses the core version for core resources', () => {
    const item: Record<string, any> = { metadata: { name: 'web' } };
    expect(ensureTypeMeta(item, { kind: 'Pod', group: '', version: 'v1' })).toMatchObject({
      kind: 'Pod',
      apiVersion: 'v1',
    });
  });

  it('does not overwrite existing type metadata', () => {
    const item: Record<string, any> = { kind: 'Custom', apiVersion: 'example.com/v2' };
    expect(ensureTypeMeta(item, deployment)).toMatchObject({
      kind: 'Custom',
      apiVersion: 'example.com/v2',
    });
  });
});
