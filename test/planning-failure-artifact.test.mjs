import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ReviewableWorkflowGraphPlanningError,
  WorkflowGraphPlanningError,
} from '@openapi-flow/langchain';
import { createPlanningFailureArtifact } from '../integration/utils/create-planning-failure-artifact.mjs';

test('planning diagnostics preserve exact stage, cause and rejected proposal without repair', () => {
  for (const ErrorClass of [
    ReviewableWorkflowGraphPlanningError,
    WorkflowGraphPlanningError,
  ]) {
    for (const stage of ['proposal-schema', 'graph-validation']) {
      const output = {
        additionalNativeNodes: [],
        edges: [{ from: 'unknown' }],
      };
      const cause = new Error('plan edge references a missing node');
      const error = new ErrorClass({ stage, output }, cause);
      const before = JSON.stringify(output);
      const artifact = createPlanningFailureArtifact(error);
      assert.equal(artifact.stage, stage);
      assert.equal(artifact.output, output);
      assert.equal(artifact.cause.message, cause.message);
      assert.equal(artifact.message, error.message);
      assert.equal(JSON.stringify(output), before);
    }
  }
});

test('unclassified transport failures never copy message, request, headers or auth data', () => {
  const error = Object.assign(new Error('sensitive transport response'), {
    request: { headers: { authorization: 'sensitive-fixture-only' } },
    cause: { body: 'sensitive payload' },
  });
  assert.deepEqual(createPlanningFailureArtifact(error), {
    kind: 'unclassified',
    name: 'Error',
  });
  assert.deepEqual(createPlanningFailureArtifact('sensitive payload'), {
    kind: 'unclassified',
    name: 'string',
  });
});
