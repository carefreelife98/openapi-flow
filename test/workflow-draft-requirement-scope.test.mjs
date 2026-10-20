import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  describeWorkflowDraftSelectedNodes,
  describeWorkflowDraftRequirementEdit,
  describeWorkflowDraftClarificationScopes,
  createWorkflowDraftRequirementAnswerSchema,
  createWorkflowDraftEditCandidateContext,
  stageWorkflowDraftEdit,
  assembleWorkflowDraftEdit,
  validateWorkflowDraft,
} from '@openapi-flow/core';
import {
  pendingRequirementScopeFixture,
  pendingRequirementScopeEditInput,
} from './fixtures/workflow-draft-requirement-scope-fixture.mjs';

function answer(input, nodeIds) {
  return {
    stepId: input.plan.steps.find(
      (step) => step.decision.kind === 'revise-requirement',
    ).id,
    kind: 'requirement',
    answerMessageId: 'human-scope-answer',
    text: 'Explicit confirmed purpose for the selected role',
    state: 'confirmed',
    scope: { kind: 'nodes', nodeIds },
  };
}

test('API and native scopes share selected identities before material readiness without copying request values', async () => {
  for (const kind of ['api', 'native']) {
    const f = await pendingRequirementScopeFixture({ kind });
    const input = pendingRequirementScopeEditInput(f);
    const addition = input.plan.steps[0];
    const nodes = describeWorkflowDraftSelectedNodes(input);
    assert.ok(nodes.some((node) => node.id === addition.newNodeId));
    assert.deepEqual(
      nodes,
      describeWorkflowDraftClarificationScopes(input).nodes,
    );
    const description = describeWorkflowDraftRequirementEdit({
      ...input,
      stepId: input.plan.steps[1].id,
    });
    assert.deepEqual(description.nodes, nodes);
    assert.deepEqual(description.requirement, f.draft.requirements[0]);
    const selected = nodes.find((node) => node.id === addition.newNodeId);
    assert.equal(selected.kind, kind);
    assert.equal(Object.hasOwn(selected, 'values'), false);
    if (kind === 'api')
      assert.deepEqual(selected.operation, f.context.operations[0]);
    description.requirement.text = 'Mutated view';
    description.nodes[0].instruction = 'Mutated view';
    assert.deepEqual(f.draft.requirements[0].text, 'Original purpose');
    const resolution = answer(input, [addition.newNodeId]);
    const context = createWorkflowDraftEditCandidateContext({
      ...input,
      resolutions: [resolution],
    });
    assert.ok(
      context.messages.some(
        (message) => message.id === resolution.answerMessageId,
      ),
    );
    const stage = stageWorkflowDraftEdit({
      ...input,
      resolutions: [resolution],
    });
    assert.deepEqual(stage.content.requirements[0].scope, resolution.scope);
    assert.ok(stage.pendingResolutionStepIds.includes(addition.id));
    assert.equal(
      [...stage.content.apiCalls, ...stage.content.nativeNodes].some(
        (node) => node.id === addition.newNodeId,
      ),
      false,
    );
    assert.throws(
      () => assembleWorkflowDraftEdit({ ...input, resolutions: [resolution] }),
      /Missing draft edit resolution/,
    );
    assert.deepEqual(f.draft, input.draft);
  }
});

test('typed answer schemas enumerate actual scope IDs and reject unknown, duplicate and removed nodes at the core boundary', async () => {
  const f = await pendingRequirementScopeFixture();
  const input = pendingRequirementScopeEditInput(f, [
    { kind: 'remove-node', nodeId: 'unchanged-pass' },
    { kind: 'add-api-call', operation: f.context.operations[0].key },
    { kind: 'revise-requirement', requirementId: 'purpose' },
  ]);
  const stepId = input.plan.steps[2].id;
  const description = describeWorkflowDraftRequirementEdit({
    ...input,
    stepId,
  });
  const selected = input.plan.steps[1].newNodeId;
  assert.deepEqual(
    description.nodes.map((node) => node.id),
    [selected],
  );
  const schema = createWorkflowDraftRequirementAnswerSchema(description);
  for (const nodeIds of [
    ['unknown'],
    ['unchanged-pass'],
    [selected, selected],
    [],
  ]) {
    const { kind, stepId, ...fields } = answer(input, nodeIds);
    assert.equal(schema.safeParse(fields).success, false);
    assert.throws(() =>
      createWorkflowDraftEditCandidateContext({
        ...input,
        resolutions: [{ kind, stepId, ...fields }],
      }),
    );
  }
  const forged = globalThis.structuredClone(description);
  forged.nodes.push({ ...forged.nodes[0], id: 'unknown' });
  const { kind, stepId: answerStepId, ...fields } = answer(input, ['unknown']);
  assert.equal(
    createWorkflowDraftRequirementAnswerSchema(forged).safeParse(fields)
      .success,
    true,
  );
  assert.throws(() =>
    stageWorkflowDraftEdit({
      ...input,
      resolutions: [{ kind, stepId: answerStepId, ...fields }],
    }),
  );
  const wire = z.toJSONSchema(schema);
  assert.ok(JSON.stringify(wire).includes(selected));
  assert.equal(JSON.stringify(wire).includes('unchanged-pass'), false);
});

test('pending selected identity is not executable and final assembly preserves exact scope, source history and original API contract', async () => {
  const f = await pendingRequirementScopeFixture();
  const input = pendingRequirementScopeEditInput(f);
  const id = input.plan.steps[0].newNodeId;
  const resolutions = [
    answer(input, [id]),
    {
      stepId: input.plan.steps[0].id,
      kind: 'api-call',
      values: { path: { id: 'explicit-record' } },
      bindings: [],
    },
  ];
  const result = assembleWorkflowDraftEdit({ ...input, resolutions });
  const context = createWorkflowDraftEditCandidateContext({
    ...input,
    resolutions,
  });
  validateWorkflowDraft({ draft: result.draft, context });
  assert.deepEqual(result.draft.apiCalls[0], {
    id,
    operation: f.context.operations[0].key,
    values: { path: { id: 'explicit-record' } },
    bindings: [],
  });
  assert.deepEqual(result.draft.requirements[0].scope, {
    kind: 'nodes',
    nodeIds: [id],
  });
  assert.deepEqual(
    result.draft.requirementHistory[0],
    f.draft.requirementHistory[0],
  );
  assert.deepEqual(
    result.draft.requirementHistory[1].evidence.map(
      (source) => source.messageId,
    ),
    ['edit-scope', 'human-scope-answer'],
  );
  assert.deepEqual(result.draft.nativeNodes, f.draft.nativeNodes);
  assert.deepEqual(result.draft.edges, f.draft.edges);
});

test('requirement contracts reject stale plans, modified allocated IDs and non-requirement steps without a model call', async () => {
  const f = await pendingRequirementScopeFixture();
  const input = pendingRequirementScopeEditInput(f);
  assert.throws(
    () =>
      describeWorkflowDraftRequirementEdit({
        ...input,
        stepId: input.plan.steps[0].id,
      }),
    /revise-requirement/,
  );
  assert.throws(
    () => describeWorkflowDraftRequirementEdit({ ...input, stepId: 'unknown' }),
    /revise-requirement/,
  );
  const forged = globalThis.structuredClone(input.plan);
  forged.steps[0].newNodeId = 'forged';
  assert.throws(
    () => describeWorkflowDraftSelectedNodes({ ...input, plan: forged }),
    /modified identities/,
  );
  const stale = {
    ...input,
    context: {
      ...input.context,
      messages: input.context.messages.map((message) => ({
        ...message,
        text: message.text + ' changed',
      })),
    },
  };
  assert.throws(() => describeWorkflowDraftSelectedNodes(stale));
  assert.equal(f.model.calls.length, 0);
});
