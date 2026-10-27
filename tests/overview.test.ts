import { describe, expect, it } from 'vitest';
import { scopedListPath } from '../server/src/api/overview.js';

describe('overview list paths', () => {
  it('places the namespace before the resource for core APIs', () => {
    expect(scopedListPath('/api/v1/{ns}/pods', 'cmp-staging')).toBe(
      '/api/v1/namespaces/cmp-staging/pods',
    );
  });

  it('places the namespace before the resource for grouped APIs', () => {
    expect(scopedListPath('/apis/apps/v1/{ns}/deployments', 'cmp-staging')).toBe(
      '/apis/apps/v1/namespaces/cmp-staging/deployments',
    );
  });

  it('omits the namespace for cluster-wide lists', () => {
    expect(scopedListPath('/api/v1/{ns}/pods')).toBe('/api/v1/pods');
  });

  it('encodes namespace segments', () => {
    expect(scopedListPath('/api/v1/{ns}/pods', 'a/b')).toBe('/api/v1/namespaces/a%2Fb/pods');
  });
});
