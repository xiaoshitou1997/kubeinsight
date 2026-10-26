const SUFFIX: Record<string, number> = {
  '': 1,
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
};

/** Parse a Kubernetes resource.Quantity into bytes (or base units). */
export function parseQuantity(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = /^([+-]?\d+(?:\.\d+)?)([a-zA-Z]*)$/.exec(String(value).trim());
  if (!match) return null;
  const factor = SUFFIX[match[2]];
  if (factor === undefined) return null;
  return Number(match[1]) * factor;
}

/** Parse a CPU quantity into millicores. */
export function parseCpuMillis(value: string | number | undefined | null): number | null {
  const parsed = parseQuantity(value);
  if (parsed === null) return null;
  return Math.round(parsed * 1000);
}

/** Parse a memory quantity into bytes. */
export function parseBytes(value: string | number | undefined | null): number | null {
  return parseQuantity(value);
}

export function percent(used: number | null | undefined, total: number | null | undefined): number | null {
  if (used === null || used === undefined || !total || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((used / total) * 1000) / 10));
}

export function sum(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) total += value;
  }
  return total;
}
