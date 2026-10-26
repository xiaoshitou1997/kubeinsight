import { stringify } from 'yaml';

const LAST_APPLIED = 'kubectl.kubernetes.io/last-applied-configuration';

type KubeObject = Record<string, any>;

export interface SanitizeOptions {
  /** When false, Secret payloads are removed and only key names are returned. */
  revealSecrets?: boolean;
}

/** Remove noisy server-side fields before sending objects to the browser. */
export function sanitizeObject<T extends KubeObject>(input: T, options: SanitizeOptions = {}): T {
  const object = input as KubeObject;
  const metadata = object.metadata;
  if (metadata) {
    delete metadata.managedFields;
    delete metadata.selfLink;
    if (metadata.annotations) {
      delete metadata.annotations[LAST_APPLIED];
      if (Object.keys(metadata.annotations).length === 0) delete metadata.annotations;
    }
  }

  if (object.kind === 'Secret') {
    if (options.revealSecrets) {
      object._masked = false;
      object._keys = Object.keys(object.data ?? object.stringData ?? {}).sort();
    } else {
      const keys = Object.keys(object.data ?? object.stringData ?? {}).sort();
      delete object.data;
      delete object.stringData;
      delete object.binaryData;
      object._masked = true;
      object._keys = keys;
    }
  }

  return object as T;
}

export interface EditableYamlOptions {
  includeStatus?: boolean;
}

/** Build a clean YAML document suitable for editing / re-applying. */
export function editableYaml(input: KubeObject, options: EditableYamlOptions = {}): string {
  const clone = structuredClone(input);
  delete clone._masked;
  delete clone._keys;
  delete clone.metadata?.managedFields;
  delete clone.metadata?.uid;
  delete clone.metadata?.resourceVersion;
  delete clone.metadata?.generation;
  delete clone.metadata?.creationTimestamp;
  if (!options.includeStatus) delete clone.status;
  if (clone.metadata?.annotations) {
    delete clone.metadata.annotations[LAST_APPLIED];
  }
  return stringify(clone, { lineWidth: 0, aliasDuplicateObjects: false }).trimEnd() + '\n';
}

export function objectYaml(input: KubeObject): string {
  return editableYaml(input, { includeStatus: true });
}

/** Strip immutable/server-populated fields before server-side apply. */
export function applyBody(input: KubeObject): string {
  const clone = structuredClone(input);
  delete clone.status;
  delete clone.metadata?.managedFields;
  delete clone.metadata?.resourceVersion;
  delete clone.metadata?.uid;
  delete clone.metadata?.creationTimestamp;
  delete clone.metadata?.generation;
  delete clone.metadata?.selfLink;
  delete clone.metadata?.deletionTimestamp;
  delete clone.metadata?.deletionGracePeriodSeconds;
  if (clone.metadata?.annotations) {
    delete clone.metadata.annotations[LAST_APPLIED];
  }
  return stringify(clone, { lineWidth: 0, aliasDuplicateObjects: false });
}

export function ageSeconds(timestamp: string | undefined): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 1000));
}

export function eventTime(event: KubeObject): string | undefined {
  return (
    event.lastTimestamp ||
    event.eventTime ||
    event.series?.lastObservedTime ||
    event.metadata?.creationTimestamp
  );
}

export function eventTimestamp(event: KubeObject): number {
  const value = eventTime(event);
  const parsed = value ? Date.parse(value) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Best-effort status/reason for a Pod, aligned with kubectl's output. */
export function podStatus(pod: KubeObject): { phase: string; reason: string; ready: boolean; restarts: number } {
  const phase: string = pod.status?.phase ?? 'Unknown';
  const containers: KubeObject[] = pod.status?.containerStatuses ?? [];
  const ready = containers.length > 0 && containers.every((c) => c.ready);
  let restarts = 0;
  for (const container of containers) restarts += container.restartCount ?? 0;

  if (pod.metadata?.deletionTimestamp) {
    return { phase, reason: 'Terminating', ready, restarts };
  }

  let reason = phase;
  for (const container of containers) {
    const waiting = container.state?.waiting;
    if (waiting?.reason) {
      reason = waiting.reason;
      break;
    }
    const terminated = container.state?.terminated;
    if (terminated?.reason && phase !== 'Running') {
      reason = terminated.reason;
    }
  }

  if (phase === 'Running' && !ready && reason === 'Running') {
    reason = 'NotReady';
  }

  return { phase, reason, ready, restarts };
}
