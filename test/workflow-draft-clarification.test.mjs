import assert from 'node:assert/strict';
import test from 'node:test';
import {
  prepareWorkflowDraftClarification,
  describeWorkflowDraftClarification,
  createWorkflowDraftClarificationScopeSchema,
  describeWorkflowDraftClarificationScopes,
  resolveWorkflowDraftClarificationScopes,
  stageWorkflowDraftEdit,
  describeWorkflowDraftApiCallPlanning,
  createWorkflowDraftEditPlan,
  assembleWorkflowDraftEdit,
} from '@openapi-flow/core';
import {
  planWorkflowDraftClarificationScopes,
  generateWorkflowDraftApiCallArguments,
  WorkflowDraftClarificationScopePlanningError,
} from '@openapi-flow/langchain';
import { draftClarificationFixture } from './fixtures/workflow-draft-clarification-fixture.mjs';
import {
  apiCallBindingPlan,
  apiCallArgumentsProposal,
  apiCallPlanningModel,
} from './fixtures/workflow-draft-api-call-planning-fixture.mjs';

test('clarification facts and explicit reply receipts are re-derived, not accepted as a generated prompt or editable result', async () => {
  const input = await draftClarificationFixture({ reply: 'answered' });
  const described = describeWorkflowDraftClarification(input.context);
  assert.equal(described.facts.length, 2);
  assert.deepEqual(described.deferredQuestions, []);
  const receipt = input.clarification.answerMessages[0];
  assert.equal(JSON.parse(receipt.text).kind, 'clarification-reply-evidence');
  assert.equal(
    JSON.parse(receipt.text).reply.choiceId,
    input.question.answer.choices[0].id,
  );
  const changed = globalThis.structuredClone(input.resolution);
  changed.requirementsPrompt = 'An invented request';
  assert.throws(
    () =>
      prepareWorkflowDraftClarification({
        context: input.originalContext,
        round: input.round,
        resolution: changed,
      }),
    /modified facts|provenance/,
  );
  assert.throws(
    () =>
      describeWorkflowDraftClarification({
        ...input.context,
        messages: input.originalContext.messages,
      }),
    /reply evidence.*missing/,
  );
  const forged = globalThis.structuredClone(input.clarification);
  forged.answerMessages[0].text = 'Invented user text';
  assert.throws(
    () =>
      describeWorkflowDraftClarification({
        ...input.context,
        clarification: forged,
      }),
    /differs/,
  );
  assert.deepEqual(input.draft.requirements, []);
});

test('scope output contains only known requirement keys and actual workflow/node choices, not fact text or status', async () => {
  const input = await draftClarificationFixture();
  const schema = createWorkflowDraftClarificationScopeSchema(input);
  const proposal = input.clarificationScopes.proposal;
  assert.equal(schema.safeParse(proposal).success, true);
  for (const mutation of [
    { scopes: {} },
    {
      scopes: { ...proposal.scopes, invented: { scope: { kind: 'workflow' } } },
    },
    {
      scopes: Object.fromEntries(
        Object.keys(proposal.scopes).map((id) => [
          id,
          { scope: { kind: 'nodes', nodeIds: ['invented'] } },
        ]),
      ),
    },
    {
      scopes: Object.fromEntries(
        Object.keys(proposal.scopes).map((id) => [
          id,
          { scope: { kind: 'nodes', nodeIds: [input.rootId, input.rootId] } },
        ]),
      ),
    },
    {
      scopes: Object.fromEntries(
        Object.keys(proposal.scopes).map((id) => [
          id,
          { scope: { kind: 'workflow' }, state: 'confirmed' },
        ]),
      ),
    },
  ])
    assert.equal(schema.safeParse(mutation).success, false);
});

test('deferred question blocks only its selected node while the independent original API remains plannable', async () => {
  const input = await draftClarificationFixture();
  const before = globalThis.structuredClone(input.draft);
  const stage = stageWorkflowDraftEdit(input);
  const blocked = stage.content.requirements.find(
    (requirement) => requirement.state === 'deferred',
  );
  assert.deepEqual(blocked.scope, {
    kind: 'nodes',
    nodeIds: [input.addressId],
  });
  assert.equal(blocked.origin.sourceId, input.question.id);
  const root = { ...input, stepId: input.plan.steps[0].id };
  assert.equal(describeWorkflowDraftApiCallPlanning(root).nodeId, input.rootId);
  assert.throws(
    () =>
      describeWorkflowDraftApiCallPlanning({
        ...input,
        stepId: input.plan.steps[1].id,
      }),
    /blocked by an unresolved requirement/,
  );
  const bindingPlan = apiCallBindingPlan(root, []);
  const result = await generateWorkflowDraftApiCallArguments({
    ...root,
    bindingPlan,
    model: apiCallPlanningModel([
      apiCallArgumentsProposal(root, { path: { seedId: 'seed' } }),
    ]),
  });
  const independent = stageWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.equal(independent.content.apiCalls.length, 1);
  assert.deepEqual(independent.content.apiCalls[0].values, {
    path: { seedId: 'seed' },
  });
  assert.deepEqual(input.draft, before);
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({ ...input, resolutions: [result.resolution] }),
    /Missing draft edit resolution/,
  );
});

test('scope receipts cannot bypass missing/stale context, edited facts, invented state or changed selected nodes', async () => {
  const input = await draftClarificationFixture();
  const { clarificationScopes, ...missing } = input;
  assert.throws(
    () => stageWorkflowDraftEdit(missing),
    /explicit clarificationScopes/,
  );
  const forged = globalThis.structuredClone(clarificationScopes);
  forged.requirements[1].state = 'confirmed';
  assert.throws(
    () => stageWorkflowDraftEdit({ ...input, clarificationScopes: forged }),
    /modified requirements/,
  );
  assert.throws(
    () =>
      resolveWorkflowDraftClarificationScopes({
        ...input,
        fingerprint: 'stale',
        proposal: clarificationScopes.proposal,
      }),
    /fingerprint is stale/,
  );
  const changed = {
    ...input,
    context: {
      ...input.context,
      operations: input.context.operations.slice(1),
    },
  };
  assert.throws(
    () => stageWorkflowDraftEdit(changed),
    /stale|context|contract|operation/i,
  );
});

test('a no-change decision cannot discard pending questions; resolved no-change never writes requirements into the draft', async () => {
  const deferred = await draftClarificationFixture();
  const proposal = {
    decisions: [
      {
        kind: 'no-change',
        instruction: 'Keep the original draft unchanged.',
        sources: [
          {
            kind: 'message',
            messageId: 'request-1',
            quote: deferred.originalContext.messages[0].text,
          },
        ],
      },
    ],
  };
  assert.throws(
    () =>
      createWorkflowDraftEditPlan({
        ...deferred,
        options: { includeExplanations: false },
        proposal,
      }),
    /cannot discard unresolved/,
  );
  const resolved = await draftClarificationFixture({ reply: 'answered' });
  const plan = createWorkflowDraftEditPlan({
    ...resolved,
    options: { includeExplanations: false },
    proposal,
  });
  const scopeInput = { ...resolved, plan };
  const result = await planWorkflowDraftClarificationScopes({
    ...scopeInput,
    model: apiCallPlanningModel([]),
  });
  assert.deepEqual(result.requirements, []);
  const candidate = assembleWorkflowDraftEdit({
    ...scopeInput,
    clarificationScopes: result,
  });
  assert.equal(candidate.status, 'no-change');
  assert.deepEqual(candidate.draft, resolved.draft);
});

test('one scope model call preserves the exact typed decisions and original failures without retries', async () => {
  const input = await draftClarificationFixture();
  const model = apiCallPlanningModel([input.clarificationScopes.proposal]);
  const result = await planWorkflowDraftClarificationScopes({
    ...input,
    model,
  });
  assert.deepEqual(result, input.clarificationScopes);
  assert.equal(model.requests.length, 1);
  const payload = JSON.parse(model.requests[0].messages[1].content);
  assert.equal(Object.hasOwn(payload, 'fingerprint'), false);
  const broken = apiCallPlanningModel([{ scopes: {} }]);
  await assert.rejects(
    () => planWorkflowDraftClarificationScopes({ ...input, model: broken }),
    (error) =>
      error instanceof WorkflowDraftClarificationScopePlanningError &&
      error.failure.stage === 'scope-schema' &&
      error.failure.output.scopes !== undefined,
  );
  assert.equal(broken.requests.length, 1);
});

test('all facts retain exact source lineage when confirmed requests are finally assembled', async () => {
  const input = await draftClarificationFixture({ reply: 'answered' });
  const description = describeWorkflowDraftClarificationScopes(input);
  assert.equal(description.requirements.length, 2);
  const resolutions = [];
  for (const [index, step] of input.plan.steps.entries()) {
    const current = { ...input, stepId: step.id, resolutions };
    const bindingPlan = apiCallBindingPlan(
      current,
      index === 0
        ? []
        : [
            {
              targetPointer: '/query/owner',
              sourceNodeId: input.rootId,
              sourcePointer: '/accountId',
            },
          ],
    );
    const result = await generateWorkflowDraftApiCallArguments({
      ...current,
      bindingPlan,
      model: apiCallPlanningModel(
        index === 0
          ? [apiCallArgumentsProposal(current, { path: { seedId: 'seed' } })]
          : [],
      ),
    });
    resolutions.push(result.resolution);
  }
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions,
    connections: [
      {
        stepIds: [input.plan.steps[1].id],
        kind: 'add-edge',
        edge: {
          from: input.rootId,
          output: 'main',
          to: input.addressId,
          input: 'main',
        },
      },
    ],
  });
  assert.equal(candidate.draft.requirements.length, 2);
  assert.ok(
    candidate.draft.requirements.every(
      (requirement) =>
        requirement.state === 'confirmed' &&
        requirement.origin.roundId === input.round.id,
    ),
  );
  const answerFact = candidate.draft.requirements.find((requirement) =>
    requirement.origin.sourceId.endsWith(':answer'),
  );
  assert.deepEqual(answerFact.sourceMessageIds, [
    input.clarification.answerMessages[0].id,
  ]);
  assert.deepEqual(input.draft.requirements, []);
});

test('an unresolved optional extension can remain unselected without a fake node or blocking independent work, but cannot be discarded at adoption', async () => {
  const base = await draftClarificationFixture();
  const plan = createWorkflowDraftEditPlan({
    ...base,
    options: { includeExplanations: false },
    proposal: { decisions: [base.plan.steps[0].decision] },
  });
  const input = { ...base, plan };
  const description = describeWorkflowDraftClarificationScopes(input);
  const proposal = {
    scopes: Object.fromEntries(
      description.requirements.map((requirement) => [
        requirement.id,
        {
          scope:
            requirement.origin.kind === 'clarification-question'
              ? { kind: 'unselected-work' }
              : { kind: 'nodes', nodeIds: [plan.steps[0].newNodeId] },
        },
      ]),
    ),
  };
  const clarificationScopes = resolveWorkflowDraftClarificationScopes({
    ...input,
    fingerprint: description.fingerprint,
    proposal,
  });
  assert.deepEqual(clarificationScopes.unselectedQuestionIds, [
    base.question.id,
  ]);
  assert.equal(clarificationScopes.requirements.length, 1);
  const scoped = { ...input, clarificationScopes };
  const root = { ...scoped, stepId: plan.steps[0].id };
  assert.equal(
    describeWorkflowDraftApiCallPlanning(root).nodeId,
    plan.steps[0].newNodeId,
  );
  const bindingPlan = apiCallBindingPlan(root, []);
  const result = await generateWorkflowDraftApiCallArguments({
    ...root,
    bindingPlan,
    model: apiCallPlanningModel([
      apiCallArgumentsProposal(root, { path: { seedId: 'seed' } }),
    ]),
  });
  const stage = stageWorkflowDraftEdit({
    ...scoped,
    resolutions: [result.resolution],
  });
  assert.equal(stage.content.apiCalls.length, 1);
  assert.deepEqual(stage.pendingClarificationQuestionIds, [base.question.id]);
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({
        ...scoped,
        resolutions: [result.resolution],
      }),
    /requires explicit clarification replies/,
  );
  const forged = globalThis.structuredClone(proposal);
  forged.scopes[description.requirements[0].id].scope = {
    kind: 'unselected-work',
  };
  assert.equal(
    createWorkflowDraftClarificationScopeSchema(input).safeParse(forged)
      .success,
    false,
  );
});
