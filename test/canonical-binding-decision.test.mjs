import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowDraftEditPlan,
  describeWorkflowDraftApiCallPlanning,
} from '@openapi-flow/core';
import { planWorkflowDraftApiCallBindings } from '@openapi-flow/langchain';
import { createPassThroughCapability } from '@openapi-flow/n8n';
import { canonicalInputReplyFixture } from './fixtures/canonical-input-reply-fixture.mjs';

async function inputFor(extra = []) {
  const f = await canonicalInputReplyFixture();
  const context = {
    ...f.context,
    capabilities: [createPassThroughCapability()],
    messages: [
      {
        id: 'request',
        text: '회원 정보를 조회합니다. 필요한 값은 사용자가 제공합니다.',
      },
    ],
  };
  const sources = [
    { kind: 'message', messageId: 'request', quote: context.messages[0].text },
  ];
  const decisions = [
    {
      kind: 'add-api-call',
      operation: context.operations[0].key,
      instruction: '회원 정보 조회',
      sources,
    },
    ...extra.map((decision) => ({
      ...decision,
      instruction: '명시된 독립 역할 또는 미확정 소스 요구',
      sources,
    })),
  ];
  const input = { draft: f.draft, context, requestMessageIds: ['request'] };
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: { decisions },
  });
  return { ...input, plan, stepId: plan.steps[0].id, resolutions: [] };
}

test('an isolated API has no predecessor choice and code returns no bindings without consuming the missing literal', async () => {
  const input = await inputFor();
  const description = describeWorkflowDraftApiCallPlanning(input);
  assert.equal(description.hasOtherSelectedNodes, false);
  assert.deepEqual(description.sources.values, []);
  let calls = 0;
  const result = await planWorkflowDraftApiCallBindings({
    ...input,
    model: {
      withStructuredOutput() {
        calls++;
        throw new Error('No mapping choice exists');
      },
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.bindings, []);
  assert.equal(Object.hasOwn(result, 'values'), false);
  assert.deepEqual(input.draft.apiCalls, []);
});

test('a selected but not-yet-materialized native producer is not mistaken for an isolated API', async () => {
  const input = await inputFor([
    { kind: 'add-native-node', capability: 'pass-through' },
  ]);
  const description = describeWorkflowDraftApiCallPlanning(input);
  assert.deepEqual(description.sources.values, []);
  assert.equal(description.hasOtherSelectedNodes, true);
  await assert.rejects(
    planWorkflowDraftApiCallBindings({
      ...input,
      model: {
        withStructuredOutput() {
          throw new Error(
            'Actual selected producer still requires a binding decision',
          );
        },
      },
    }),
    /Actual selected producer/,
  );
});

test('an explicit owned binding concern survives even if no producer is currently selected', async () => {
  const input = await inputFor([
    {
      kind: 'needs-clarification',
      owner: { kind: 'planning-step', decisionIndex: 0, stage: 'api-bindings' },
    },
  ]);
  assert.equal(
    describeWorkflowDraftApiCallPlanning(input).hasOtherSelectedNodes,
    false,
  );
  await assert.rejects(
    planWorkflowDraftApiCallBindings({
      ...input,
      model: {
        withStructuredOutput() {
          throw new Error('Explicit binding concern needs a decision');
        },
      },
    }),
    /Explicit binding concern/,
  );
});
