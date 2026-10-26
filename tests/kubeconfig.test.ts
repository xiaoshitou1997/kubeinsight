import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadKubeConfigs } from '../server/src/kubeconfig.js';

let dir: string;
let file: string;

const caData = Buffer.from('test-ca').toString('base64');
const certData = Buffer.from('test-cert').toString('base64');
const keyData = Buffer.from('test-key').toString('base64');

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'kubeinsight-test-'));
  file = path.join(dir, 'config');
  writeFileSync(
    file,
    `apiVersion: v1
kind: Config
current-context: prod@cluster
clusters:
  - name: cluster
    cluster:
      server: https://127.0.0.1:6443
      certificate-authority-data: ${caData}
      tls-server-name: api.internal
  - name: insecure
    cluster:
      server: http://10.0.0.1:8080
      insecure-skip-tls-verify: true
contexts:
  - name: prod@cluster
    context:
      cluster: cluster
      user: admin
      namespace: prod
  - name: dev@cluster
    context:
      cluster: insecure
      user: token-user
      namespace: dev
users:
  - name: admin
    user:
      client-certificate-data: ${certData}
      client-key-data: ${keyData}
  - name: token-user
    user:
      token: super-secret
`,
  );

  writeFileSync(
    path.join(dir, 'extra'),
    `apiVersion: v1
kind: Config
contexts:
  - name: extra
    context:
      cluster: extra-cluster
      user: extra-user
clusters:
  - name: extra-cluster
    cluster:
      server: https://extra.example.com
users:
  - name: extra-user
    user:
      exec:
        apiVersion: client.authentication.k8s.io/v1
        command: aws
        args: ["eks", "get-token", "--cluster-name", "demo"]
`,
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('kubeconfig loading', () => {
  it('resolves contexts, namespaces and client certificates', () => {
    const set = loadKubeConfigs(file);
    expect(set.contexts).toHaveLength(2);
    expect(set.currentContext).toBe('prod@cluster');
    const prod = set.contexts.find((context) => context.id === 'prod@cluster');
    expect(prod?.namespace).toBe('prod');
    expect(prod?.server).toBe('https://127.0.0.1:6443');
    expect(prod?.ca?.toString()).toBe('test-ca');
    expect(prod?.tlsServerName).toBe('api.internal');
    expect(prod?.auth.kind).toBe('client-cert');
    if (prod?.auth.kind === 'client-cert') {
      expect(prod.auth.cert.toString()).toBe('test-cert');
      expect(prod.auth.key.toString()).toBe('test-key');
    }
  });

  it('keeps bearer tokens and insecure flags', () => {
    const set = loadKubeConfigs(file);
    const dev = set.contexts.find((context) => context.id === 'dev@cluster');
    expect(dev?.insecureSkipTlsVerify).toBe(true);
    expect(dev?.auth).toMatchObject({ kind: 'token', token: 'super-secret' });
  });

  it('merges multiple kubeconfig files in order', () => {
    const set = loadKubeConfigs([file, path.join(dir, 'extra')].join(path.delimiter));
    expect(set.contexts.map((context) => context.id)).toEqual([
      'prod@cluster',
      'dev@cluster',
      'extra',
    ]);
    const extra = set.contexts.find((context) => context.id === 'extra');
    expect(extra?.auth.kind).toBe('exec');
    if (extra?.auth.kind === 'exec') {
      expect(extra.auth.exec.command).toBe('aws');
      expect(extra.auth.exec.args).toContain('get-token');
    }
  });

  it('reports missing kubeconfig paths instead of crashing', () => {
    const set = loadKubeConfigs(path.join(dir, 'does-not-exist'));
    expect(set.contexts).toHaveLength(0);
    expect(set.warnings.join(' ')).toContain('not found');
  });
});
