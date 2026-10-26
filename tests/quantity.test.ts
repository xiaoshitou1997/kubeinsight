import { describe, expect, it } from 'vitest';
import { parseBytes, parseCpuMillis, parseQuantity, percent } from '../server/src/util/quantity.js';

describe('quantity parsing', () => {
  it('parses CPU units', () => {
    expect(parseCpuMillis('250m')).toBe(250);
    expect(parseCpuMillis('2')).toBe(2000);
    expect(parseCpuMillis('1.5')).toBe(1500);
    expect(parseCpuMillis('100000n')).toBe(0);
    expect(parseCpuMillis(undefined)).toBeNull();
  });

  it('parses memory units', () => {
    expect(parseBytes('128Mi')).toBe(128 * 1024 ** 2);
    expect(parseBytes('1Gi')).toBe(1024 ** 3);
    expect(parseBytes('1G')).toBe(1e9);
    expect(parseBytes('500Ki')).toBe(512_000);
    expect(parseBytes('not-a-quantity')).toBeNull();
  });

  it('parses generic quantities', () => {
    expect(parseQuantity('2k')).toBe(2000);
    expect(parseQuantity('1.5M')).toBe(1_500_000);
    expect(parseQuantity('')).toBeNull();
  });

  it('computes clamped percentages', () => {
    expect(percent(1, 4)).toBe(25);
    expect(percent(0, 0)).toBeNull();
    expect(percent(10, 4)).toBe(100);
  });
});
