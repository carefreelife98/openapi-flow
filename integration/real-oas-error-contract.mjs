import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiOperations,
  OpenApiFlowError,
} from '@openapi-flow/core';
import { planApiBindings } from '@openapi-flow/langchain';

const directory = process.env.OPENAPI_FLOW_FAILURE_OAS_DIR;
assert.ok(
  directory,
  'OPENAPI_FLOW_FAILURE_OAS_DIR must identify a private large-catalog OAS directory',
);

test('170 real-OAS materials distinguish omitted-call rejection from a successful no-binding plan', async () => {
  const files = (await readdir(directory, { withFileTypes: true })).filter(
    (entry) => entry.isFile() && entry.name.endsWith('.json'),
  );
  assert.ok(
    files.length >= 2,
    'This regression requires multiple original OAS documents',
  );
  const sources = await Promise.all(
    files.map(async (entry) => ({
      id: entry.name,
      spec: JSON.parse(await readFile(join(directory, entry.name), 'utf8')),
    })),
  );
  const original = JSON.stringify(sources);
  const catalog = await createApiCatalog(sources);
  assert.ok(
    catalog.operations.length >= 170,
    'This regression requires at least 170 original operations',
  );
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.slice(0, 170).map((operation) => operation.key),
  );
  const materials = operations.map((operation, index) => ({
    callId: `call-${index + 1}`,
    operation,
  }));
  let invocations = 0;
  let omitCall = true;
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          invocations++;
          return {
            calls: materials
              .slice(omitCall ? 1 : 0)
              .map((material) => ({ callId: material.callId, bindings: [] })),
            gaps: [],
          };
        },
      };
    },
  };
  const input = {
    scenario:
      'Plan each selected API independently. Request values are planned separately; do not add response bindings.',
    materials,
    model,
  };
  await assert.rejects(planApiBindings(input), (error) => {
    assert.ok(error instanceof OpenApiFlowError);
    assert.deepEqual(error.toJSON(), {
      code: 'API_BINDING_CALL_COVERAGE_MISMATCH',
      owner: 'core',
      operation: 'validateApiBindingAssignments',
      stage: 'contract-validation',
      expectedCount: 170,
      actualCount: 169,
      distinctCount: 169,
    });
    return true;
  });
  assert.equal(invocations, 1);
  omitCall = false;
  const result = await planApiBindings(input);
  assert.equal(result.calls.length, 170);
  assert.deepEqual(result.gaps, []);
  assert.equal(invocations, 2);
  assert.equal(JSON.stringify(sources), original);
});
