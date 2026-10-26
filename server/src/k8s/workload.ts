import { HttpError } from '../errors.js';
import { parseQuantity } from '../util/quantity.js';

export type KubeObject = Record<string, any>;

export interface ImageChange {
  name: string;
  image: string;
}

export interface ImageChangeResult {
  name: string;
  section: 'containers' | 'initContainers';
  from: string;
  to: string;
}

export interface ResourceValues {
  cpu?: string | null;
  memory?: string | null;
}

export interface ResourceChange {
  name: string;
  requests?: ResourceValues;
  limits?: ResourceValues;
}

export interface ResourceChangeResult {
  name: string;
  requests: ResourceValues;
  limits: ResourceValues;
}

export interface MetadataChange {
  labels?: Record<string, string | null>;
  annotations?: Record<string, string | null>;
}

export interface ScheduleChange {
  schedule?: string;
  suspend?: boolean;
  timeZone?: string;
}

const IMAGE_KINDS = new Set(['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'CronJob']);
const RESOURCE_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'CronJob']);

/** Nested path to the PodSpec for a supported resource kind. */
export function workloadSpecPath(kind: string): string[] | null {
  switch (kind) {
    case 'Pod':
      return ['spec'];
    case 'Deployment':
    case 'StatefulSet':
    case 'DaemonSet':
    case 'ReplicaSet':
    case 'Job':
      return ['spec', 'template', 'spec'];
    case 'CronJob':
      return ['spec', 'jobTemplate', 'spec', 'template', 'spec'];
    default:
      return null;
  }
}

export function supportsImageUpdate(kind: string): boolean {
  return IMAGE_KINDS.has(kind);
}

export function supportsResourceUpdate(kind: string): boolean {
  return RESOURCE_KINDS.has(kind);
}

export function getWorkloadSpec(object: KubeObject, kind: string): KubeObject | undefined {
  const path = workloadSpecPath(kind);
  if (!path) return undefined;
  let current: any = object;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[segment];
  }
  return current && typeof current === 'object' ? current : undefined;
}

export function getWorkloadContainers(
  object: KubeObject,
  kind: string,
  section: 'containers' | 'initContainers' = 'containers',
): KubeObject[] {
  const spec = getWorkloadSpec(object, kind);
  return Array.isArray(spec?.[section]) ? spec[section] : [];
}

function nest(path: string[], leaf: KubeObject): KubeObject {
  const root: KubeObject = {};
  let current = root;
  for (const segment of path) {
    current[segment] = {};
    current = current[segment];
  }
  Object.assign(current, leaf);
  return root;
}

function normalizeImage(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'Container image must be a string.');
  }
  const image = value.trim();
  if (!image) throw new HttpError(400, 'Container image cannot be empty.');
  if (image.length > 512 || /\s/.test(image)) {
    throw new HttpError(400, `Invalid container image: ${JSON.stringify(value)}`);
  }
  return image;
}

function containerName(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value)) {
    throw new HttpError(400, `Invalid container name: ${JSON.stringify(value)}`);
  }
  return value;
}

function dedupeNames(changes: Array<{ name: string }>): void {
  const seen = new Set<string>();
  for (const change of changes) {
    if (seen.has(change.name)) {
      throw new HttpError(400, `Container ${change.name} was specified more than once.`);
    }
    seen.add(change.name);
  }
}

/**
 * Builds a strategic-merge patch that replaces image fields on named
 * containers. Only containers that actually change are included.
 */
export function buildImagePatch(
  object: KubeObject,
  kind: string,
  changes: ImageChange[],
  initChanges: ImageChange[] = [],
): { patch: KubeObject; changed: ImageChangeResult[] } {
  if (!supportsImageUpdate(kind)) {
    throw new HttpError(
      400,
      `Image update is not supported for ${kind}. Supported kinds: Pod, Deployment, StatefulSet, DaemonSet, CronJob.`,
    );
  }
  const path = workloadSpecPath(kind);
  if (!path) throw new HttpError(400, `Unsupported resource kind: ${kind}`);

  if (!Array.isArray(changes) || !Array.isArray(initChanges)) {
    throw new HttpError(400, 'containers and initContainers must be arrays.');
  }
  for (const item of [...changes, ...initChanges]) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HttpError(400, 'Each container change must be an object.');
    }
  }
  if (changes.length === 0 && initChanges.length === 0) {
    throw new HttpError(400, 'No container changes were provided.');
  }
  if (changes.length + initChanges.length > 64) {
    throw new HttpError(400, 'Too many container changes.');
  }

  const currentContainers = getWorkloadContainers(object, kind, 'containers');
  const currentInitContainers = getWorkloadContainers(object, kind, 'initContainers');
  const patchGroups: {
    containers: Array<{ name: string; image: string }>;
    initContainers: Array<{ name: string; image: string }>;
  } = { containers: [], initContainers: [] };
  const changed: ImageChangeResult[] = [];

  const apply = (
    section: 'containers' | 'initContainers',
    items: ImageChange[],
    existing: KubeObject[],
  ) => {
    const normalized = items.map((item) => ({
      name: containerName(item.name),
      image: normalizeImage(item.image),
    }));
    dedupeNames(normalized);
    for (const item of normalized) {
      const current = existing.find((container) => container.name === item.name);
      if (!current) {
        throw new HttpError(400, `Container ${item.name} does not exist in ${kind}.`);
      }
      if (current.image === item.image) continue;
      patchGroups[section].push(item);
      changed.push({
        name: item.name,
        section,
        from: String(current.image ?? ''),
        to: item.image,
      });
    }
  };

  apply('containers', changes, currentContainers);
  apply('initContainers', initChanges, currentInitContainers);

  if (changed.length === 0) {
    throw new HttpError(400, 'The requested images are identical to the current images.');
  }

  const leaf: KubeObject = {};
  if (patchGroups.containers.length > 0) leaf.containers = patchGroups.containers;
  if (patchGroups.initContainers.length > 0) leaf.initContainers = patchGroups.initContainers;

  return { patch: nest(path, leaf), changed };
}

function normalizeQuantity(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.startsWith('-')) {
    throw new HttpError(400, `${field} cannot be negative.`);
  }
  if (parseQuantity(text) === null) {
    throw new HttpError(400, `Invalid quantity for ${field}: ${JSON.stringify(value)}`);
  }
  return text;
}

export function buildResourcePatch(
  object: KubeObject,
  kind: string,
  changes: ResourceChange[],
): { patch: KubeObject; changed: ResourceChangeResult[] } {
  if (!supportsResourceUpdate(kind)) {
    throw new HttpError(
      400,
      `Resource editing is not supported for ${kind}. Supported kinds: Deployment, StatefulSet, DaemonSet, CronJob.`,
    );
  }
  const path = workloadSpecPath(kind);
  if (!path) throw new HttpError(400, `Unsupported resource kind: ${kind}`);
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new HttpError(400, 'No container changes were provided.');
  }
  if (changes.length > 64) throw new HttpError(400, 'Too many container changes.');
  for (const change of changes) {
    if (!change || typeof change !== 'object' || Array.isArray(change)) {
      throw new HttpError(400, 'Each container change must be an object.');
    }
  }

  const currentContainers = getWorkloadContainers(object, kind, 'containers');
  const containers: Array<{ name: string; resources: KubeObject }> = [];
  const changed: ResourceChangeResult[] = [];
  dedupeNames(changes.map((change) => ({ name: containerName(change.name) })));

  for (const change of changes) {
    const name = containerName(change.name);
    const existing = currentContainers.find((container) => container.name === name);
    if (!existing) throw new HttpError(400, `Container ${name} does not exist in ${kind}.`);

    const resources: KubeObject = {};
    const summary: ResourceChangeResult = { name, requests: {}, limits: {} };

    for (const section of ['requests', 'limits'] as const) {
      const values = change[section];
      if (values === undefined) continue;
      if (values === null || typeof values !== 'object' || Array.isArray(values)) {
        throw new HttpError(400, `${name}.${section} must be an object.`);
      }
      const normalized: ResourceValues = {};
      for (const resource of ['cpu', 'memory'] as const) {
        if (!(resource in values)) continue;
        const quantity = normalizeQuantity(values[resource], `${name}.${section}.${resource}`);
        normalized[resource] = quantity;
      }
      if (Object.keys(normalized).length === 0) continue;
      resources[section] = normalized;
      summary[section] = normalized;
    }

    if (Object.keys(resources).length === 0) {
      throw new HttpError(400, `No resource values were provided for ${name}.`);
    }
    containers.push({ name, resources });
    changed.push(summary);
  }

  return {
    patch: nest(path, { containers }),
    changed,
  };
}

function normalizeMetadataMap(
  value: Record<string, string | null> | undefined,
  field: 'labels' | 'annotations',
): Record<string, string | null> | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `${field} must be an object.`);
  }
  const normalized: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!key || key.length > 253) {
      throw new HttpError(400, `Invalid ${field} key: ${JSON.stringify(key)}`);
    }
    if (raw === null) {
      normalized[key] = null;
      continue;
    }
    if (typeof raw !== 'string') {
      throw new HttpError(400, `${field}.${key} must be a string or null.`);
    }
    if (raw.length > 200_000) {
      throw new HttpError(400, `${field}.${key} is too large.`);
    }
    normalized[key] = raw;
  }
  return normalized;
}

export function buildMetadataPatch(change: MetadataChange): KubeObject {
  if (!change || typeof change !== 'object' || Array.isArray(change)) {
    throw new HttpError(400, 'Metadata update must be an object.');
  }
  const labels = normalizeMetadataMap(change.labels, 'labels');
  const annotations = normalizeMetadataMap(change.annotations, 'annotations');
  if (labels === undefined && annotations === undefined) {
    throw new HttpError(400, 'Provide labels or annotations to update.');
  }
  const metadata: KubeObject = {};
  if (labels !== undefined) metadata.labels = labels;
  if (annotations !== undefined) metadata.annotations = annotations;
  return { metadata };
}

export function buildSchedulePatch(kind: string, change: ScheduleChange): KubeObject {
  if (!change || typeof change !== 'object' || Array.isArray(change)) {
    throw new HttpError(400, 'Schedule update must be an object.');
  }
  if (kind !== 'CronJob') {
    throw new HttpError(400, 'Schedule editing is only supported for CronJob.');
  }
  const spec: KubeObject = {};
  if (change.schedule !== undefined) {
    if (typeof change.schedule !== 'string' || !change.schedule.trim()) {
      throw new HttpError(400, 'schedule cannot be empty.');
    }
    const schedule = change.schedule.trim();
    const fields = schedule.split(/\s+/);
    if (!schedule.startsWith('@') && fields.length !== 5) {
      throw new HttpError(400, 'schedule must be a five-field cron expression or a @macro.');
    }
    spec.schedule = schedule;
  }
  if (change.suspend !== undefined) {
    if (typeof change.suspend !== 'boolean') {
      throw new HttpError(400, 'suspend must be a boolean.');
    }
    spec.suspend = change.suspend;
  }
  if (change.timeZone !== undefined) {
    if (typeof change.timeZone !== 'string') {
      throw new HttpError(400, 'timeZone must be a string.');
    }
    if (change.timeZone.trim()) spec.timeZone = change.timeZone.trim();
    else spec.timeZone = null;
  }
  if (Object.keys(spec).length === 0) {
    throw new HttpError(400, 'No schedule changes were provided.');
  }
  return { spec };
}
