import assert from 'node:assert/strict';
import { describeApiLiteralJsonSources } from '@openapi-flow/core';

/** Fixture construction for the ID-only wire protocol, not a product compatibility adapter. */
export function literalJsonCandidateId(text) {
  const [catalog] = describeApiLiteralJsonSources([{ id: 'fixture', text }]);
  const candidate = catalog.json.find((item) => item.text === text);
  assert.ok(candidate, 'Fixture text must be one complete original JSON token');
  return candidate.id;
}
