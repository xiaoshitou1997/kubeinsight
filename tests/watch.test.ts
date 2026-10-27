import { describe, expect, it } from 'vitest';
import { createWatchLineParser, parseWatchLine } from '../server/src/api/watch.js';

describe('Kubernetes watch stream parsing', () => {
  it('parses watch events', () => {
    expect(parseWatchLine('{"type":"ADDED","object":{"kind":"Pod"}}')).toEqual({
      type: 'ADDED',
      object: { kind: 'Pod' },
    });
  });

  it('extracts bookmark resource versions', () => {
    const event = parseWatchLine(
      '{"type":"BOOKMARK","object":{"metadata":{"resourceVersion":"12345"}}}',
    );
    expect(event).toEqual({ type: 'BOOKMARK', object: { metadata: { resourceVersion: '12345' } }, resourceVersion: '12345' });
  });

  it('ignores blank and malformed lines', () => {
    expect(parseWatchLine('')).toBeNull();
    expect(parseWatchLine('   ')).toBeNull();
    expect(parseWatchLine('{broken')).toBeNull();
    expect(parseWatchLine('{"object":{}}')).toBeNull();
  });

  it('buffers partial chunks and emits complete JSON lines', () => {
    const events: Array<Record<string, unknown>> = [];
    const push = createWatchLineParser((event) => events.push(event));
    push('{"type":"ADDED","object":{"kind":"Po');
    push('d"}}\n{"type":"DELETED","object":{"kind":"Pod"}}\n{"type":"MOD');
    push('IFIED","object":{"kind":"Pod"}}\n');
    expect(events.map((event) => event.type)).toEqual(['ADDED', 'DELETED', 'MODIFIED']);
  });
});
