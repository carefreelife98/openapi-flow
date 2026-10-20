import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewableWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import { validateApiRequestMediaTypeDecision } from '@openapi-flow/core';
import { requestMediaDecisionFixture } from './fixtures/request-media-decisions-fixture.mjs';

test('same API in JSON and form roles keeps each supplied role through media and literal planning', async () => {
  const fixture = await requestMediaDecisionFixture();
  const calls = [];
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ name: options.name, payload });
          if (options.name === 'select_api_operations')
            return schema.parse({
              operations: [
                { candidateId: 'candidate-1', purpose: 'JSON role' },
                { candidateId: 'candidate-1', purpose: 'form role' },
              ],
              gaps: [],
            });
          if (options.name === 'select_api_request_media_type') {
            assert.ok(['JSON role', 'form role'].includes(payload.purpose));
            return schema.parse({
              requestMediaType:
                payload.purpose === 'JSON role'
                  ? 'application/json'
                  : 'application/x-www-form-urlencoded',
              explanation: {
                reason: 'Use the explicitly supplied format for this role.',
              },
            });
          }
          if (options.name === 'plan_api_bindings')
            return schema.parse({
              calls: payload.materials.map((material) => ({
                callId: material.callId,
                bindings: [],
              })),
              gaps: [],
            });
          if (options.name === 'generate_api_arguments') {
            assert.equal(
              payload.requestMediaType,
              payload.purpose === 'JSON role'
                ? 'application/json'
                : 'application/x-www-form-urlencoded',
            );
            return schema.parse({
              values: { body: { label: 'fixture-label', count: 3 } },
              explanation: {
                reason: 'Use the supplied literals for this role.',
              },
            });
          }
          if (options.name === 'plan_reviewable_workflow_graph')
            return {
              edges: [],
              additionalGaps: [],
              blockedCalls: [],
            };
          throw new Error(`Unexpected role stage ${options.name}`);
        },
      };
    },
  };
  const scenario =
    'Call the same validation API in two independent roles: JSON role uses application/json; form role uses application/x-www-form-urlencoded. Both use label "fixture-label" and integer count 3.';
  const result = await createReviewableWorkflowGenerationGraph({
    model,
    capabilities: [],
    argumentOptions: { includeExplanations: true },
    requestMediaOptions: { includeExplanations: true },
  }).invoke({
    workflowId: 'format-roles',
    workflowName: 'Two explicit formats',
    scenario,
    sources: [{ id: 'media-decision', spec: fixture.spec }],
    trace: [],
  });
  assert.equal(result.status, 'complete');
  assert.deepEqual(
    result.reviewMaterials.map(
      (material) => material.arguments.requestMediaType,
    ),
    ['application/json', 'application/x-www-form-urlencoded'],
  );
  for (const [index, record] of result.requestMediaTypes.entries()) {
    const purpose = result.selection.operations[index].purpose;
    assert.equal(
      record.decision.assessment.explanation.evidence[0].purpose,
      purpose,
    );
    validateApiRequestMediaTypeDecision({
      operation: fixture.operation,
      scenario,
      purpose,
      decision: record.decision,
    });
  }
  assert.deepEqual(result.reviewPlan.edges, []);
  assert.equal(
    calls.filter((call) => call.name === 'select_api_request_media_type')
      .length,
    2,
  );
  assert.equal(
    calls.filter((call) => call.name === 'generate_api_arguments').length,
    2,
  );
});
