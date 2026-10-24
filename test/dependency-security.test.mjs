import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

for (const kind of ['array', 'set', 'map']) {
  test(`host Zod rejects an oversized ${kind} before visiting its entries`, () => {
    let visited = 0;
    const value = z.string().refine(() => {
      visited++;
      return true;
    });
    const schema = {
      array: z.array(value).max(1),
      set: z.set(value).max(1),
      map: z.map(z.string(), value).max(1),
    }[kind];
    const input = {
      array: ['a', 'b'],
      set: new Set(['a', 'b']),
      map: new Map([
        ['a', 'a'],
        ['b', 'b'],
      ]),
    }[kind];
    const result = schema.safeParse(input);
    assert.equal(result.success, false);
    assert.equal(visited, 0);
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, 'too_big');
  });
}
