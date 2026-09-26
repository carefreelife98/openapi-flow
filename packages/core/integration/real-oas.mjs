import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { operationsFromSpec, validateOpenApi } from '@openapi-flow/core';

const directory = process.env.OPENAPI_FLOW_REAL_OAS_DIR;
if (!directory) {
  throw new Error('OPENAPI_FLOW_REAL_OAS_DIR is required by test:real-oas');
}

const entries = await readdir(directory, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  .map((entry) => entry.name)
  .sort();
if (files.length === 0) {
  throw new Error(`OPENAPI_FLOW_REAL_OAS_DIR has no JSON files: ${directory}`);
}

for (const [index, file] of files.entries()) {
  const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
  test(`real OAS ${index + 1} validates`, () => {
    const validated = validateOpenApi(spec);
    assert.ok(Object.keys(validated.paths).length > 0);
  });
  test(`real OAS ${index + 1} exposes operations`, async () => {
    const operations = await operationsFromSpec(spec);
    assert.ok(operations.length > 0);
    assert.equal(
      new Set(operations.map(({ operationRef }) => operationRef)).size,
      operations.length,
    );
  });
}
