export interface Gvr {
  group: string;
  version: string;
  plural: string;
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$/;
const GROUP_PART = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

export function assertSegment(value: string, field: string): string {
  if (!SEGMENT.test(value)) {
    throw new Error(`Invalid ${field}: ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertGvr(gvr: Gvr): Gvr {
  if (gvr.group && !GROUP_PART.test(gvr.group)) throw new Error(`Invalid API group: ${gvr.group}`);
  if (!GROUP_PART.test(gvr.version)) throw new Error(`Invalid API version: ${gvr.version}`);
  if (!GROUP_PART.test(gvr.plural)) throw new Error(`Invalid resource: ${gvr.plural}`);
  return gvr;
}

export function apiBase(gvr: Gvr): string {
  assertGvr(gvr);
  return gvr.group ? `/apis/${gvr.group}/${gvr.version}` : `/api/${gvr.version}`;
}

export interface ResourcePathOptions {
  namespace?: string;
  name?: string;
  subresource?: string;
}

export function resourcePath(gvr: Gvr, options: ResourcePathOptions = {}): string {
  assertGvr(gvr);
  let path = apiBase(gvr);
  if (options.namespace) {
    path += `/namespaces/${assertSegment(options.namespace, 'namespace')}`;
  }
  path += `/${gvr.plural}`;
  if (options.name) {
    path += `/${assertSegment(options.name, 'name')}`;
  }
  if (options.subresource) {
    path += `/${assertSegment(options.subresource, 'subresource')}`;
  }
  return path;
}

/** Standard list options passed through to the Kubernetes API. */
export interface ListParams {
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  limit?: number;
  continue?: string;
  resourceVersion?: string;
}

export function listQuery(params: ListParams): Record<string, string | number | undefined> {
  return {
    labelSelector: params.labelSelector || undefined,
    fieldSelector: params.fieldSelector || undefined,
    limit: params.limit && params.limit > 0 ? Math.min(params.limit, 1000) : undefined,
    continue: params.continue || undefined,
    resourceVersion: params.resourceVersion || undefined,
  };
}
