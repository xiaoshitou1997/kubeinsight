import { Router } from '../http/router.js';
import { metaHandler } from './meta.js';
import { discoveryHandler, healthHandler } from './discovery.js';
import {
  applyHandler,
  deleteResourceHandler,
  getResourceHandler,
  listResourcesHandler,
} from './resources.js';
import { overviewHandler } from './overview.js';
import { cordonHandler, restartHandler, scaleHandler } from './actions.js';
import { eventsHandler } from './events.js';
import { metricsHandler } from './metrics.js';
import { accessHandler } from './access.js';
import { searchHandler } from './search.js';
import { logsHandler } from './logs.js';

export function createRouter(): Router {
  const router = new Router();
  router.get('/api/meta', metaHandler);
  router.get('/api/discovery', discoveryHandler);
  router.get('/api/health', healthHandler);
  router.get('/api/overview', overviewHandler);

  router.get('/api/resources', listResourcesHandler);
  router.get('/api/resource', getResourceHandler);
  router.post('/api/apply', applyHandler);
  router.delete('/api/resource', deleteResourceHandler);

  router.post('/api/scale', scaleHandler);
  router.post('/api/restart', restartHandler);
  router.post('/api/cordon', cordonHandler);

  router.get('/api/events', eventsHandler);
  router.get('/api/metrics', metricsHandler);
  router.get('/api/access', accessHandler);
  router.get('/api/search', searchHandler);
  router.get('/api/logs', logsHandler);

  return router;
}
