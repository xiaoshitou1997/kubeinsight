import type { Handler } from './context.js';

interface Route {
  method: string;
  path: string;
  handler: Handler;
}

export class Router {
  private readonly routes: Route[] = [];

  get(path: string, handler: Handler): this {
    this.routes.push({ method: 'GET', path, handler });
    return this;
  }

  post(path: string, handler: Handler): this {
    this.routes.push({ method: 'POST', path, handler });
    return this;
  }

  put(path: string, handler: Handler): this {
    this.routes.push({ method: 'PUT', path, handler });
    return this;
  }

  delete(path: string, handler: Handler): this {
    this.routes.push({ method: 'DELETE', path, handler });
    return this;
  }

  match(method: string, path: string): Handler | undefined {
    const normalized = path.replace(/\/+$/, '') || '/';
    return this.routes.find(
      (route) =>
        route.path === normalized &&
        (route.method === method || (method === 'HEAD' && route.method === 'GET')),
    )?.handler;
  }

  get routeCount(): number {
    return this.routes.length;
  }
}
