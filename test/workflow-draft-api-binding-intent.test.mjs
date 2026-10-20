import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeWorkflowDraftApiBindingIntent,
  createWorkflowDraftApiBindingIntentSchema,
  resolveWorkflowDraftApiBindingIntent,
  describeWorkflowDraftApiCallBindings,
  createWorkflowDraftApiCallBindingsSchema,
  resolveWorkflowDraftApiCallBindings,
} from '@openapi-flow/core';
import {
  selectWorkflowDraftApiBindingInputs,
  planWorkflowDraftApiCallBindings,
  generateWorkflowDraftApiCallArguments,
} from '@openapi-flow/langchain';
import {
  apiCallPlanningFixture,
  apiCallEvidence,
  sourceIdMapping,
  apiCallArgumentsProposal,
  apiCallPlanningModel,
} from './fixtures/workflow-draft-api-call-planning-fixture.mjs';

function intent(input, targets) {
  return resolveWorkflowDraftApiBindingIntent({
    ...input,
    fingerprint: describeWorkflowDraftApiBindingIntent(input).fingerprint,
    proposal: { targets, ...apiCallEvidence(input) },
  });
}

test('a fixed dependency target constrains mappings and questions without changing the original OAS', async () => {
  const input = await apiCallPlanningFixture('add-api-call', 'producer', true);
  input.requestMediaType = 'application/json';
  const original = globalThis.structuredClone(input.context.operations);
  const scoped = { ...input, inputIntent: intent(input, ['/path/id']) };
  const schema = createWorkflowDraftApiCallBindingsSchema(scoped);
  const proposal = {
    decision: {
      status: 'provided',
      mappings: [sourceIdMapping],
      ...apiCallEvidence(input),
    },
  };
  const result = resolveWorkflowDraftApiCallBindings({
    ...scoped,
    fingerprint: describeWorkflowDraftApiCallBindings(scoped).fingerprint,
    proposal,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.inputIntent, scoped.inputIntent);
  for (const targetPointer of ['/body/name', '/body/config/count']) {
    assert.equal(
      schema.safeParse({
        decision: {
          ...proposal.decision,
          mappings: [{ ...sourceIdMapping, targetPointer }],
        },
      }).success,
      false,
    );
    assert.equal(
      schema.safeParse({
        decision: {
          ...proposal.decision,
          status: 'needs-clarification',
          mappings: [],
          questions: [{ kind: 'binding-intent', targetPointer }],
        },
      }).success,
      false,
    );
  }
  assert.throws(
    () =>
      resolveWorkflowDraftApiCallBindings({
        ...scoped,
        fingerprint: result.fingerprint,
        proposal: { decision: { ...proposal.decision, mappings: [] } },
      }),
    /every selected input-intent target/,
  );
  assert.deepEqual(input.context.operations, original);
});

test('empty intent makes zero binding-model calls but still exposes actual missing required literals', async () => {
  const input = await apiCallPlanningFixture();
  const scoped = { ...input, inputIntent: intent(input, []) };
  const bindingPlan = await planWorkflowDraftApiCallBindings(scoped);
  assert.equal(bindingPlan.status, 'ready');
  assert.deepEqual(bindingPlan.bindings, []);
  assert.equal(
    createWorkflowDraftApiCallBindingsSchema(scoped).safeParse({
      decision: { ...bindingPlan.proposal.decision, mappings: [] },
    }).success,
    false,
  );
  const result = await generateWorkflowDraftApiCallArguments({
    ...input,
    bindingPlan,
    model: apiCallPlanningModel([apiCallArgumentsProposal(input)]),
  });
  assert.equal(result.status, 'needs-input');
  assert.deepEqual(
    result.requirements.map((entry) => entry.targetPointer),
    ['/path/id'],
  );
});

test('genuinely requested nested inputs remain selectable and intent receipts reject stale or tampered state', async () => {
  const input = await apiCallPlanningFixture('add-api-call', 'producer', true);
  input.requestMediaType = 'application/json';
  const targets = [
    '/body/config/count',
    '/body/lines/0/id',
    '/body/config/a.b',
  ];
  const inputIntent = intent(input, targets);
  assert.deepEqual(inputIntent.targets, targets);
  for (const bad of [
    ['/body', '/body/name'],
    ['/path/id', '/path/id'],
    ['/query/not-declared'],
  ])
    assert.throws(
      () => intent(input, bad),
      /overlap|repeats|permitted|Invalid/,
    );
  assert.throws(
    () =>
      describeWorkflowDraftApiCallBindings({
        ...input,
        inputIntent: { ...inputIntent, targets: [] },
      }),
    /differs from its original/,
  );
  assert.throws(
    () =>
      describeWorkflowDraftApiCallBindings({
        ...input,
        requestMediaType: 'application/x-www-form-urlencoded',
        inputIntent,
      }),
    /stale|different/,
  );
});

test('intent selection exposes only selected-request semantics; the binding model sees only selected target contracts', async () => {
  const input = await apiCallPlanningFixture('add-api-call', 'producer', true);
  input.requestMediaType = 'application/json';
  const stages = [];
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          stages.push(options.name);
          if (options.name === 'select_draft_api_binding_inputs') {
            assert.ok(payload.requestSchema);
            assert.equal('sourceCandidates' in payload, false);
            assert.equal('draft' in payload, false);
            assert.equal('fingerprint' in payload, false);
            return { targets: ['/path/id'], ...apiCallEvidence(input) };
          }
          assert.equal(options.name, 'plan_draft_api_call_bindings');
          assert.equal('requestSchema' in payload, false);
          assert.equal('requestInputRoots' in payload, false);
          assert.deepEqual(
            payload.bindingTargets.map((entry) => entry.targetPointer),
            ['/path/id'],
          );
          assert.ok(payload.sourceCandidates.length);
          assert.deepEqual(
            schema.properties.decision.anyOf[0].properties.mappings.items
              .properties.targetPointer.enum,
            ['/path/id'],
          );
          return {
            decision: {
              status: 'provided',
              mappings: [sourceIdMapping],
              ...apiCallEvidence(input),
            },
          };
        },
      };
    },
  };
  const inputIntent = await selectWorkflowDraftApiBindingInputs({
    ...input,
    model,
  });
  const bindingPlan = await planWorkflowDraftApiCallBindings({
    ...input,
    inputIntent,
    model,
  });
  assert.equal(bindingPlan.status, 'ready');
  assert.deepEqual(stages, [
    'select_draft_api_binding_inputs',
    'plan_draft_api_call_bindings',
  ]);
  assert.equal(
    createWorkflowDraftApiBindingIntentSchema(input).safeParse({
      targets: [],
      ...apiCallEvidence(input),
      bindings: [],
    }).success,
    false,
  );
});
