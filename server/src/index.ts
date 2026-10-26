#!/usr/bin/env node
import { loadConfig } from './config.js';
import { loadKubeConfigs } from './kubeconfig.js';
import { setLogLevel, log } from './logger.js';
import { AppState } from './state.js';
import { createApp } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  const kube = loadKubeConfigs(config.kubeconfigPath);
  if (config.contextName && !kube.contexts.some((c) => c.id === config.contextName)) {
    log.warn(`Requested context "${config.contextName}" was not found; using ${kube.currentContext ?? 'the first available context'}.`);
  }

  const state = new AppState(config, kube);
  const server = createApp(state);

  const shutdown = (signal: string) => {
    log.info(`Received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled promise rejection', { error: String(reason) });
  });

  server.listen(config.port, config.host);
}

main().catch((error) => {
  log.error('Fatal startup error', { error: (error as Error).message });
  process.exit(1);
});
