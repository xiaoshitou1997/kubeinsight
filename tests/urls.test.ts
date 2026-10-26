import { describe, expect, it } from 'vitest';
import { apiBase, assertSegment, listQuery, resourcePath } from '../server/src/k8s/urls.js';

describe('Kubernetes URL construction', () => {
  it('builds core API paths', () => {
    expect(apiBase({ group: '', version: 'v1', plural: 'pods' })).toBe('/api/v1');
    expect(
      resourcePath(
        { group: '', version: 'v1', plural: 'pods' },
        { namespace: 'default', name: 'web-1' },
      ),
    ).toBe('/api/v1/namespaces/default/pods/web-1');
  });

  it('builds grouped API paths and subresources', () => {
    expect(
      resourcePath(
        { group: 'apps', version: 'v1', plural: 'deployments' },
        { namespace: 'prod', name: 'api', subresource: 'scale' },
      ),
    ).toBe('/apis/apps/v1/namespaces/prod/deployments/api/scale');
  });

  it('rejects path traversal and separators', () => {
    expect(() => assertSegment('../secrets', 'namespace')).toThrow();
    expect(() => assertSegment('a/b', 'name')).toThrow();
    expect(() =>
      resourcePath(
        { group: '', version: 'v1', plural: 'pods' },
        { namespace: '../../etc', name: 'x' },
      ),
    ).toThrow();
  });

  it('rejects malformed API groups', () => {
    expect(() => apiBase({ group: 'apps/evil', version: 'v1', plural: 'deployments' })).toThrow();
  });

  it('caps list limits', () => {
    expect(listQuery({ limit: 10_000 }).limit).toBe(1000);
    expect(listQuery({ labelSelector: 'app=web' }).labelSelector).toBe('app=web');
    expect(listQuery({}).limit).toBeUndefined();
  });
});
