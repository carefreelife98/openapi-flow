import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewableWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import { validateApiLiteralGenerationRecord } from '@openapi-flow/core';
import { createApiBindingMaterials } from '../examples/langgraph-workflow/dist/graph/prepare-api-binding-materials.js';
import {
  repeatedCallLiteralFixture,
  repeatedCallLiteralModel,
} from './fixtures/repeated-call-literal-fixture.mjs';

test('two roles of one original API keep separate argument calls, values, provenance and parallel roots', async () => {
  const fixture = await repeatedCallLiteralFixture();
  const model = repeatedCallLiteralModel();
  const state = await createReviewableWorkflowGenerationGraph({
    model,
    capabilities: [],
    argumentOptions: { includeExplanations: true },
  }).invoke({
    workflowId: 'two-roles',
    workflowName: 'Two separate lookup roles',
    scenario: fixture.scenario,
    sources: fixture.sources,
    trace: [],
  });
  assert.equal(state.status, 'complete');
  assert.equal(state.selection.operations.length, 2);
  assert.deepEqual(
    state.selection.operations[0].key,
    state.selection.operations[1].key,
  );
  assert.deepEqual(
    state.reviewMaterials.map((material) => material.arguments.values.path.id),
    ['fixture-first', 'fixture-second'],
  );
  assert.deepEqual(state.reviewPlan.starts, [
    'two-roles-request-1',
    'two-roles-request-2',
  ]);
  assert.deepEqual(state.reviewPlan.edges, []);
  for (const material of state.reviewMaterials)
    validateApiLiteralGenerationRecord({
      callId: material.arguments.callId,
      operation: material.operation,
      bindings: material.arguments.bindings,
      scenario: fixture.scenario,
      purpose: material.purpose,
      record: material.arguments.literalGeneration,
    });
  assert.deepEqual(
    model.calls.map((call) => call.name),
    [
      'select_api_operations',
      'plan_api_bindings',
      'generate_api_arguments',
      'generate_api_arguments',
      'plan_reviewable_workflow_graph',
    ],
  );
  const stale = globalThis.structuredClone(state);
  stale.selection.operations[0].key.snapshotId = 'changed';
  assert.throws(() => createApiBindingMaterials(stale), /selected role/);
  const absent = globalThis.structuredClone(state);
  delete absent.selection;
  assert.throws(
    () => createApiBindingMaterials(absent),
    /matching selected call roles/,
  );
});
