#!/usr/bin/env node
/**
 * Read-only smoke test against a running KubeInsight instance.
 *
 *   npm run smoke
 *   BASE_URL=http://127.0.0.1:8090 npm run smoke
 */
const base = (process.env.BASE_URL || process.argv[2] || 'http://127.0.0.1:8090').replace(/\/$/, '');
const headers = {};
if (process.env.KUBEINSIGHT_AUTH_TOKEN) {
  headers.Authorization = `Bearer ${process.env.KUBEINSIGHT_AUTH_TOKEN}`;
}

let failures = 0;

async function check(name, path, validate) {
  const started = performance.now();
  try {
    const response = await fetch(`${base}${path}`, { headers });
    const duration = Math.round(performance.now() - started);
    if (!response.ok) {
      failures += 1;
      console.log(`✗ ${name.padEnd(22)} HTTP ${response.status} (${duration}ms)`);
      return undefined;
    }
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('json') ? await response.json() : await response.text();
    const detail = validate ? validate(body) : '';
    console.log(`✓ ${name.padEnd(22)} ${String(detail).padEnd(28)} ${duration}ms`);
    return body;
  } catch (error) {
    failures += 1;
    console.log(`✗ ${name.padEnd(22)} ${error.message}`);
    return undefined;
  }
}

console.log(`KubeInsight smoke test → ${base}\n`);

const meta = await check('meta', '/api/meta', (body) =>
  body.reachable ? `${body.cluster} / ${body.version?.gitVersion}` : `unreachable: ${body.error}`,
);
if (!meta) {
  console.log('\nCannot reach the KubeInsight API. Start it with `npm start` first.');
  process.exit(1);
}

await check('health', '/healthz', (body) => `uptime ${body.uptimeSeconds}s`);
await check('discovery', '/api/discovery', (body) => `${body.resources.length} resource kinds`);
await check('overview', '/api/overview', (body) => `${body.nodes.ready}/${body.nodes.total} nodes, ${body.pods.total} pods`);
const pods = await check('pods', '/api/resources?group=&version=v1&plural=pods&limit=5', (body) => `${body.items.length} items`);
await check('deployments', '/api/resources?group=apps&version=v1&plural=deployments&limit=5', (body) => `${body.items.length} items`);
await check('events', '/api/events?limit=10', (body) => `${body.items.length} events`);
await check('metrics', '/api/metrics', (body) => (body.available ? `${body.nodes.length} nodes` : 'not available'));
await check('access', '/api/access', (body) => body.identity?.username ?? 'unknown');
await check('search', '/api/search?q=a&limit=5', (body) => `${body.items.length} hits`);

const runningPod = pods?.items?.find((pod) => pod.status?.phase === 'Running');
if (runningPod) {
  const namespace = runningPod.metadata.namespace;
  const container = runningPod.spec?.containers?.[0]?.name;
  await check(
    'logs',
    `/api/logs?namespace=${encodeURIComponent(namespace)}&pod=${encodeURIComponent(runningPod.metadata.name)}&container=${encodeURIComponent(container)}&tailLines=5`,
    (text) => `${String(text).split('\n').length} lines`,
  );
} else {
  console.log('- logs                  skipped (no running pod in the first page)');
}

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
