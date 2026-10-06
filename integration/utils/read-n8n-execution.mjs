import assert from 'node:assert/strict';

// Parse only in memory: raw n8n results may contain ephemeral authentication data.
export function readN8nExecution(raw) {
  const start = raw.indexOf('\n{');
  assert.notEqual(start, -1, 'n8n execution result JSON is missing');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start + 1; index < raw.length; index += 1) {
    const character = raw[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) {
      const result = JSON.parse(raw.slice(start + 1, index + 1));
      assert.ok(
        result.data?.resultData?.runData,
        'n8n execution runData is missing',
      );
      assert.equal(typeof result.status, 'string');
      return result;
    }
  }
  throw new Error('n8n execution result JSON is incomplete');
}
