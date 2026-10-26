import { describe, expect, it } from 'vitest';
import {
  applyBody,
  editableYaml,
  podStatus,
  sanitizeObject,
} from '../server/src/k8s/sanitize.js';

function deployment() {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'web',
      namespace: 'prod',
      uid: 'abc',
      resourceVersion: '12',
      generation: 3,
      creationTimestamp: '2026-01-01T00:00:00Z',
      managedFields: [{ manager: 'kubectl' }],
      annotations: {
        'kubectl.kubernetes.io/last-applied-configuration': '{"kind":"Deployment"}',
        'example.com/team': 'platform',
      },
    },
    spec: { replicas: 2, selector: { matchLabels: { app: 'web' } } },
    status: { readyReplicas: 2 },
  };
}

describe('object sanitisation', () => {
  it('strips noisy metadata for list responses', () => {
    const object = sanitizeObject(deployment());
    expect(object.metadata.managedFields).toBeUndefined();
    expect(object.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration']).toBeUndefined();
    expect(object.metadata.annotations['example.com/team']).toBe('platform');
  });

  it('masks Secret payloads but exposes key names', () => {
    const secret = sanitizeObject({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: 'db' },
      data: { password: 'aHVudGVyMg==', username: 'YWRtaW4=' },
    });
    expect(secret.data).toBeUndefined();
    expect(secret._masked).toBe(true);
    expect(secret._keys).toEqual(['password', 'username']);
  });

  it('reveals Secret payloads only when requested', () => {
    const secret = sanitizeObject(
      {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name: 'db' },
        data: { password: 'aHVudGVyMg==' },
      },
      { revealSecrets: true },
    );
    expect(secret.data).toEqual({ password: 'aHVudGVyMg==' });
    expect(secret._masked).toBe(false);
  });

  it('produces clean editable YAML', () => {
    const yaml = editableYaml(sanitizeObject(deployment()));
    expect(yaml).toContain('kind: Deployment');
    expect(yaml).not.toContain('managedFields');
    expect(yaml).not.toContain('resourceVersion');
    expect(yaml).not.toContain('last-applied-configuration');
    expect(yaml).not.toContain('status:');
    expect(yaml).toContain('example.com/team: platform');
  });

  it('strips server-populated fields from apply bodies', () => {
    const body = applyBody(deployment());
    expect(body).not.toContain('uid:');
    expect(body).not.toContain('resourceVersion');
    expect(body).not.toContain('status');
    expect(body).not.toContain('creationTimestamp');
    expect(body).toContain('replicas: 2');
  });
});

describe('pod status', () => {
  it('detects crash loops and readiness', () => {
    const status = podStatus({
      metadata: { deletionTimestamp: null },
      status: {
        phase: 'Running',
        containerStatuses: [
          {
            ready: false,
            restartCount: 7,
            state: { waiting: { reason: 'CrashLoopBackOff' } },
          },
        ],
      },
    });
    expect(status).toMatchObject({ phase: 'Running', reason: 'CrashLoopBackOff', ready: false, restarts: 7 });
  });

  it('marks terminating pods', () => {
    const status = podStatus({
      metadata: { deletionTimestamp: '2026-01-01T00:00:00Z' },
      status: { phase: 'Running', containerStatuses: [{ ready: true, restartCount: 0 }] },
    });
    expect(status.reason).toBe('Terminating');
  });
});
