import path from 'node:path';

export interface AppConfig {
  host: string;
  port: number;
  kubeconfigPath?: string;
  contextName?: string;
  readOnly: boolean;
  allowExec: boolean;
  authToken?: string;
  webDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  version: string;
}

const VERSION = '0.1.0';

function argValue(argv: string[], name: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
  return undefined;
}

function boolEnv(name: string): boolean {
  const value = process.env[name];
  return value === '1' || value === 'true' || value === 'yes';
}

export function loadConfig(argv = process.argv.slice(2)): AppConfig {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  const port = Number(argValue(argv, 'port') ?? process.env.KUBEINSIGHT_PORT ?? 8090);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }

  const webDir =
    argValue(argv, 'web-dir') ??
    process.env.KUBEINSIGHT_WEB_DIR ??
    path.resolve(import.meta.dirname, '../public');

  const logLevel = (process.env.KUBEINSIGHT_LOG_LEVEL ?? 'info') as AppConfig['logLevel'];

  return {
    host: argValue(argv, 'host') ?? process.env.KUBEINSIGHT_HOST ?? '127.0.0.1',
    port,
    kubeconfigPath: argValue(argv, 'kubeconfig') ?? process.env.KUBEINSIGHT_KUBECONFIG ?? process.env.KUBECONFIG,
    contextName: argValue(argv, 'context') ?? process.env.KUBEINSIGHT_CONTEXT,
    readOnly: boolEnv('KUBEINSIGHT_READ_ONLY') || argv.includes('--read-only'),
    allowExec: !boolEnv('KUBEINSIGHT_DISABLE_EXEC') && !argv.includes('--no-exec'),
    authToken: process.env.KUBEINSIGHT_AUTH_TOKEN || undefined,
    webDir,
    logLevel: ['debug', 'info', 'warn', 'error'].includes(logLevel) ? logLevel : 'info',
    version: VERSION,
  };
}

function printHelp() {
  console.log(`KubeInsight ${VERSION} — a lightweight Kubernetes console

Usage: kubeinsight [options]

Options:
  --host <host>          Bind address (default: 127.0.0.1, env KUBEINSIGHT_HOST)
  --port <port>          HTTP port (default: 8090, env KUBEINSIGHT_PORT)
  --kubeconfig <path>    Kubeconfig file or path list (env KUBEINSIGHT_KUBECONFIG / KUBECONFIG)
  --context <name>       Default context (env KUBEINSIGHT_CONTEXT)
  --read-only            Disable all mutating operations (env KUBEINSIGHT_READ_ONLY=1)
  --no-exec              Disable pod exec (env KUBEINSIGHT_DISABLE_EXEC=1)
  --web-dir <path>       Directory containing the built web UI
  -h, --help             Show this help
  -v, --version          Show version

Environment:
  KUBEINSIGHT_AUTH_TOKEN Shared access token. When set, the UI asks for it once.
  KUBEINSIGHT_LOG_LEVEL  debug | info | warn | error (default: info)
`);
}
