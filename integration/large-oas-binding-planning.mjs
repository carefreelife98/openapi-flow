import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiOperations,
  describeApiBindingPlanning,
  describeApiCallBindingPlanning,
  selectDefaultApiRequestMediaType,
} from '@openapi-flow/core';
import { planApiBindingsByCall } from '@openapi-flow/langchain';

const file = process.env.OPENAPI_FLOW_LARGE_OAS_SOURCES;
const documentIds = process.env.OPENAPI_FLOW_LARGE_OAS_DOCUMENT_IDS;
assert.ok(
  file && documentIds,
  'OPENAPI_FLOW_LARGE_OAS_SOURCES and OPENAPI_FLOW_LARGE_OAS_DOCUMENT_IDS are required',
);

test('170 original multi-service OAS calls are planned without full source schemas or target ID generation in each model output', async () => {
  const ids = JSON.parse(documentIds);
  assert.ok(
    Array.isArray(ids) && ids.length >= 2 && new Set(ids).size === ids.length,
  );
  const entries = JSON.parse(await readFile(file, 'utf8'));
  assert.ok(Array.isArray(entries));
  const selected = ids.map((id) => {
    const entry = entries.find((entry) => entry.id === id);
    assert.ok(entry, `Selected OAS ${id} is absent`);
    return { id, spec: entry.spec };
  });
  const before = JSON.stringify(selected);
  const catalog = await createApiCatalog(selected);
  assert.ok(catalog.operations.length >= 170);
  // A fixed regression cohort, not a product selection limit or semantic model evaluation.
  const keys = catalog.operations
    .slice(0, 170)
    .map((operation) => operation.key);
  assert.ok(
    new Set(keys.map((key) => key.documentId)).size >= 2,
    'The supplied source order must make this regression cohort span multiple documents',
  );
  const operations = await resolveApiOperations(catalog, keys);
  const materials = operations.map((operation, index) => ({
    callId: `call-${index + 1}`,
    operation,
    requestMediaType: selectDefaultApiRequestMediaType(operation),
  }));
  const scenario =
    'Plan each selected call independently; no response-to-request dependency is requested. Actual literal request values belong to the subsequent argument stage.';
  let calls = 0;
  let maximumInputBytes = 0;
  const completed = [];
  const plan = await planApiBindingsByCall({
    scenario,
    materials,
    concurrency: 4,
    onCallPlanned: (result) => completed.push(result),
    model: {
      withStructuredOutput(schema, options) {
        assert.equal(options.name, 'select_api_binding_sources');
        return {
          async invoke(messages) {
            calls++;
            maximumInputBytes = Math.max(
              maximumInputBytes,
              Buffer.byteLength(messages[1].content),
            );
            const context = JSON.parse(messages[1].content);
            assert.equal(context.sourceCandidates.length, 169);
            assert.equal(
              JSON.stringify(context.sourceCandidates).includes('"responses"'),
              false,
            );
            return schema.parse({ sourceNodeIds: [], gaps: [] });
          },
        };
      },
    },
  });
  assert.equal(plan.calls.length, 170);
  assert.equal(new Set(plan.calls.map((call) => call.callId)).size, 170);
  assert.equal(completed.length, 170);
  assert.deepEqual(plan.gaps, []);
  assert.ok(plan.calls.every((call) => call.bindings.length === 0));
  assert.equal(JSON.stringify(selected), before);
  const previousBytes = Buffer.byteLength(
    JSON.stringify(describeApiBindingPlanning({ scenario, materials }).context),
  );
  assert.ok(maximumInputBytes < previousBytes);
  assert.equal(
    describeApiCallBindingPlanning({
      scenario,
      materials,
      callId: materials[0].callId,
    }).sourceCandidates.length,
    169,
  );
  console.log(
    JSON.stringify({
      selectedCalls: 170,
      documents: selected.length,
      invocations: calls,
      oldContextBytes: previousBytes,
      maximumDiscoveryBytes: maximumInputBytes,
      completeResults: completed.length,
      realModel: false,
    }),
  );
});
