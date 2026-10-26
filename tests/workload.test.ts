import { describe, expect, it } from 'vitest';
import {
  buildImagePatch,
  buildMetadataPatch,
  buildResourcePatch,
  buildSchedulePatch,
  getWorkloadContainers,
  supportsImageUpdate,
  supportsResourceUpdate,
} from '../server/src/k8s/workload.js';

function deployment() {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'web', namespace: 'prod', labels: { app: 'web' } },
    spec: {
      replicas: 2,
      template: {
        metadata: { labels: { app: 'web' } },
        spec: {
          containers: [
            { name: 'web', image: 'registry.example.com/web:1.0' },
            { name: 'sidecar', image: 'envoy:1.30' },
          ],
          initContainers: [{ name: 'init', image: 'busybox:1.36' }],
        },
      },
    },
  };
}

describe('image patch builder', () => {
  it('targets deployment pod templates', () => {
    const { patch, changed } = buildImagePatch(deployment(), 'Deployment', [
      { name: 'web', image: 'registry.example.com/web:1.1' },
    ]);
    expect(changed).toEqual([
      {
        name: 'web',
        section: 'containers',
        from: 'registry.example.com/web:1.0',
        to: 'registry.example.com/web:1.1',
      },
    ]);
    expect(patch).toEqual({
      spec: {
        template: {
          spec: {
            containers: [{ name: 'web', image: 'registry.example.com/web:1.1' }],
          },
        },
      },
    });
  });

  it('supports init containers', () => {
    const { patch, changed } = buildImagePatch(
      deployment(),
      'Deployment',
      [],
      [{ name: 'init', image: 'busybox:1.37' }],
    );
    expect(changed[0]?.section).toBe('initContainers');
    expect(patch.spec.template.spec.initContainers).toEqual([
      { name: 'init', image: 'busybox:1.37' },
    ]);
  });

  it('uses the Pod spec path for bare Pods', () => {
    const pod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'debug' },
      spec: { containers: [{ name: 'shell', image: 'busybox:1.36' }] },
    };
    const { patch } = buildImagePatch(pod, 'Pod', [{ name: 'shell', image: 'busybox:1.37' }]);
    expect(patch).toEqual({ spec: { containers: [{ name: 'shell', image: 'busybox:1.37' }] } });
  });

  it('uses the nested path for CronJobs', () => {
    const cronJob = {
      apiVersion: 'batch/v1',
      kind: 'CronJob',
      metadata: { name: 'nightly' },
      spec: {
        schedule: '0 2 * * *',
        jobTemplate: {
          spec: {
            template: {
              spec: {
                containers: [{ name: 'job', image: 'worker:1' }],
              },
            },
          },
        },
      },
    };
    const { patch } = buildImagePatch(cronJob, 'CronJob', [{ name: 'job', image: 'worker:2' }]);
    expect(patch.spec.jobTemplate.spec.template.spec.containers).toEqual([
      { name: 'job', image: 'worker:2' },
    ]);
  });

  it('rejects no-op, unknown and malformed images', () => {
    expect(() =>
      buildImagePatch(deployment(), 'Deployment', [
        { name: 'web', image: 'registry.example.com/web:1.0' },
      ]),
    ).toThrow(/identical/);
    expect(() =>
      buildImagePatch(deployment(), 'Deployment', [{ name: 'missing', image: 'x:1' }]),
    ).toThrow(/does not exist/);
    expect(() =>
      buildImagePatch(deployment(), 'Deployment', [{ name: 'web', image: 'bad image' }]),
    ).toThrow(/Invalid/);
    expect(() => buildImagePatch(deployment(), 'Deployment', [])).toThrow(/No container changes/);
  });

  it('rejects immutable Job image updates', () => {
    expect(supportsImageUpdate('Job')).toBe(false);
    expect(() =>
      buildImagePatch(deployment(), 'Job', [{ name: 'web', image: 'new:1' }]),
    ).toThrow(/not supported/);
  });

  it('rejects malformed change payloads', () => {
    expect(() =>
      buildImagePatch(deployment(), 'Deployment', [null as never]),
    ).toThrow(/must be an object/);
    expect(() =>
      buildImagePatch(deployment(), 'Deployment', [{ name: 'web', image: '' }]),
    ).toThrow(/cannot be empty/);
  });
});

describe('resource patch builder', () => {
  it('builds requests and limits, using null to remove values', () => {
    const { patch, changed } = buildResourcePatch(deployment(), 'Deployment', [
      {
        name: 'web',
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '500m', memory: null },
      },
    ]);
    expect(patch.spec.template.spec.containers[0]).toEqual({
      name: 'web',
      resources: {
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '500m', memory: null },
      },
    });
    expect(changed[0]?.limits.memory).toBeNull();
  });

  it('rejects invalid quantities and unsupported kinds', () => {
    expect(() =>
      buildResourcePatch(deployment(), 'Deployment', [
        { name: 'web', requests: { cpu: 'not-a-quantity' } },
      ]),
    ).toThrow(/Invalid quantity/);
    expect(supportsResourceUpdate('Pod')).toBe(false);
    expect(() =>
      buildResourcePatch(deployment(), 'Pod', [{ name: 'web', requests: { cpu: '100m' } }]),
    ).toThrow(/not supported/);
  });

  it('requires container existence', () => {
    expect(() =>
      buildResourcePatch(deployment(), 'Deployment', [
        { name: 'missing', requests: { cpu: '100m' } },
      ]),
    ).toThrow(/does not exist/);
  });

  it('rejects malformed resource payloads', () => {
    expect(() =>
      buildResourcePatch(deployment(), 'Deployment', [
        { name: 'web', requests: 'not-an-object' as never },
      ]),
    ).toThrow(/must be an object/);
    expect(() =>
      buildResourcePatch(deployment(), 'Deployment', [null as never]),
    ).toThrow(/must be an object/);
  });
});

describe('metadata and schedule patches', () => {
  it('builds nulls for removals', () => {
    const patch = buildMetadataPatch({
      labels: { app: 'web', old: null },
      annotations: { 'example.com/note': 'hello' },
    });
    expect(patch).toEqual({
      metadata: {
        labels: { app: 'web', old: null },
        annotations: { 'example.com/note': 'hello' },
      },
    });
  });

  it('validates metadata payloads', () => {
    expect(() => buildMetadataPatch({})).toThrow(/Provide labels/);
    expect(() =>
      buildMetadataPatch({ labels: { ['x'.repeat(300)]: 'value' } }),
    ).toThrow(/Invalid labels key/);
    expect(() => buildMetadataPatch(null as never)).toThrow(/must be an object/);
  });

  it('builds CronJob schedule patches', () => {
    expect(buildSchedulePatch('CronJob', { schedule: '*/10 * * * *', suspend: true })).toEqual({
      spec: { schedule: '*/10 * * * *', suspend: true },
    });
    expect(() => buildSchedulePatch('Deployment', { schedule: '*/5 * * * *' })).toThrow(
      /only supported for CronJob/,
    );
    expect(() => buildSchedulePatch('CronJob', { schedule: '* * *' })).toThrow(/five-field/);
    expect(() => buildSchedulePatch('CronJob', {})).toThrow(/No schedule changes/);
    expect(() => buildSchedulePatch('CronJob', null as never)).toThrow(/must be an object/);
  });

  it('reads container sections through the correct path', () => {
    expect(getWorkloadContainers(deployment(), 'Deployment').map((item) => item.name)).toEqual([
      'web',
      'sidecar',
    ]);
    expect(getWorkloadContainers(deployment(), 'Deployment', 'initContainers')).toHaveLength(1);
  });
});
