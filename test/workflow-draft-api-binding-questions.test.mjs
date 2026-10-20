import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  describeWorkflowDraftApiCallPlanning,
  createWorkflowDraftApiCallBindingsSchema,
  resolveWorkflowDraftApiCallBindings,
  describeWorkflowDraftApiCallArguments,
} from '@openapi-flow/core';
import {
  apiCallPlanningFixture,
  apiCallEvidence,
  apiCallBindingProposal,
  sourceIdMapping,
} from './fixtures/workflow-draft-api-call-planning-fixture.mjs';
import { connectionEditPlan } from './fixtures/workflow-draft-connection-edit-fixture.mjs';
import { planWorkflowDraftApiCallBindings } from '@openapi-flow/langchain';

function pending(input, questions, mappings = []) {
  return {
    decision: {
      status: 'needs-clarification',
      mappings,
      questions,
      ...apiCallEvidence(input),
    },
  };
}
function resolve(input, proposal, answers) {
  return resolveWorkflowDraftApiCallBindings({
    ...input,
    fingerprint: describeWorkflowDraftApiCallPlanning(input).fingerprint,
    proposal,
    ...(answers === undefined ? {} : { answers }),
  });
}

test('a model question outside the selected request is preserved as an original typed failure, with no repair or retry', async () => {
  const input = await apiCallPlanningFixture();
  const output = pending(input, [
    { kind: 'binding-intent', targetPointer: '/query/owner' },
  ]);
  let calls = 0;
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          calls++;
          return output;
        },
      };
    },
  };
  await assert.rejects(
    planWorkflowDraftApiCallBindings({ ...input, model }),
    (error) => {
      assert.equal(error.failure.stage, 'bindings');
      assert.equal(error.failure.output, output);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('binding questions cannot name another operation input or invent free-form messages and contract absence', async () => {
  const input = await apiCallPlanningFixture();
  const schema = createWorkflowDraftApiCallBindingsSchema(input);
  for (const question of [
    { kind: 'binding-intent', targetPointer: '/query/owner' },
    {
      kind: 'binding-intent',
      targetPointer: '/path/id',
      message: 'Please provide a different API contract',
    },
    {
      kind: 'binding-intent',
      targetPointer: '/path/id',
      operation: input.lookup.key,
    },
    { kind: 'missing-contract', targetPointer: '/path/id' },
  ])
    assert.equal(schema.safeParse(pending(input, [question])).success, false);
  assert.throws(() =>
    resolve(input, {
      decision: {
        status: 'needs-clarification',
        message: 'A different API needs a schema',
        ...apiCallEvidence(input),
      },
    }),
  );
  assert.throws(
    () =>
      resolve(
        input,
        pending(input, [
          {
            kind: 'binding-intent',
            targetPointer: '/path/id/not-a-string-property',
          },
        ]),
      ),
    /not declared/,
  );
});

test('code derives exact operation ownership, original target schemas, stable questions and validated source choices', async () => {
  const input = await apiCallPlanningFixture();
  const before = globalThis.structuredClone(input.draft);
  const proposal = pending(input, [
    {
      kind: 'choose-source',
      targetPointer: '/path/id',
      candidates: [{ sourceNodeId: 'source', sourcePointer: '/value' }],
    },
  ]);
  const result = resolve(input, proposal);
  assert.equal(result.status, 'needs-clarification');
  assert(!Object.hasOwn(result, 'bindings'));
  const question = result.questions[0];
  assert.deepEqual(question.operation, input.replacement.key);
  assert.equal(question.targetPointer, '/path/id');
  assert.equal(question.nodeId, input.plan.steps[0].newNodeId);
  assert(question.targetSchemas.some((schema) => schema.type === 'string'));
  assert(question.message.includes(`${question.method} ${question.path}`));
  assert(question.message.includes(question.targetPointer));
  assert.equal(question.choices[0].sourceNodeId, 'source');
  assert.equal(question.choices[0].sourcePointer, '/value');
  assert.equal(question.id, resolve(input, proposal).questions[0].id);
  const ready = resolve(input, proposal, [
    {
      kind: 'choose-source',
      questionId: question.id,
      choiceId: question.choices[0].id,
    },
  ]);
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.bindings, [
    { kind: 'node-output', ...sourceIdMapping },
  ]);
  describeWorkflowDraftApiCallArguments({ ...input, bindingPlan: ready });
  const forged = globalThis.structuredClone(ready);
  forged.answers[0].choiceId = 'forged';
  assert.throws(
    () =>
      describeWorkflowDraftApiCallArguments({ ...input, bindingPlan: forged }),
    /unknown source choice/,
  );
  assert.deepEqual(input.draft, before);
  for (const candidate of [
    { sourceNodeId: 'imagined', sourcePointer: '/value' },
    { sourceNodeId: 'config', sourcePointer: '/count' },
    { sourceNodeId: 'source', sourcePointer: '/undeclared' },
  ])
    assert.throws(() =>
      resolve(
        input,
        pending(input, [
          {
            kind: 'choose-source',
            targetPointer: '/path/id',
            candidates: [candidate],
          },
        ]),
      ),
    );
});

test('partial answers retain definite mappings but expose no executable partial call; all explicit decisions are revalidated', async () => {
  const base = await apiCallPlanningFixture('add-api-call', 'producer');
  const input = { ...base, requestMediaType: 'application/json' };
  const proposal = pending(
    input,
    [
      {
        kind: 'choose-source',
        targetPointer: '/body/name',
        candidates: [{ sourceNodeId: 'source', sourcePointer: '/value' }],
      },
      {
        kind: 'choose-source',
        targetPointer: '/body/config/count',
        candidates: [{ sourceNodeId: 'config', sourcePointer: '/count' }],
      },
    ],
    [sourceIdMapping],
  );
  const initial = resolve(input, proposal);
  const [name, count] = initial.questions;
  const first = {
    kind: 'choose-source',
    questionId: name.id,
    choiceId: name.choices[0].id,
  };
  const partial = resolve(input, proposal, [first]);
  assert.equal(partial.status, 'needs-clarification');
  assert(!Object.hasOwn(partial, 'bindings'));
  assert.deepEqual(
    partial.questions.map((question) => question.id),
    [count.id],
  );
  const second = {
    kind: 'choose-source',
    questionId: count.id,
    choiceId: count.choices[0].id,
  };
  const ready = resolve(input, proposal, [first, second]);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.bindings.length, 3);
  describeWorkflowDraftApiCallArguments({ ...input, bindingPlan: ready });
  for (const answers of [
    [],
    [first, first],
    [{ ...first, choiceId: 'unknown' }],
    [{ ...first, questionId: 'stale' }],
    [
      {
        kind: 'bind-source',
        questionId: name.id,
        sourceNodeId: 'config',
        sourcePointer: '/count',
      },
    ],
  ])
    assert.throws(() => resolve(input, proposal, answers));
  assert.throws(
    () =>
      resolve(
        input,
        pending(
          input,
          [{ kind: 'binding-intent', targetPointer: '/path/id' }],
          [sourceIdMapping],
        ),
      ),
    /overlap/,
  );
  assert.throws(
    () =>
      resolve(
        input,
        pending(input, [
          { kind: 'binding-intent', targetPointer: '/body/config' },
          { kind: 'binding-intent', targetPointer: '/body/config/count' },
        ]),
      ),
    /overlap/,
  );
  assert.throws(
    () =>
      resolve(
        input,
        pending(input, [
          {
            kind: 'choose-source',
            targetPointer: '/body/name',
            candidates: [
              { sourceNodeId: 'source', sourcePointer: '/value' },
              { sourceNodeId: 'source', sourcePointer: '/value' },
            ],
          },
        ]),
      ),
    /repeats/,
  );
});

test('dynamic object keys, escaped names and array items remain OAS-defined instead of being restricted to a finite field list', async () => {
  const base = await apiCallPlanningFixture();
  const catalog = await createApiCatalog([
    {
      id: 'dynamic-binding-contract',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Dynamic request', version: '1' },
        paths: {
          '/dynamic': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        attributes: {
                          type: 'object',
                          additionalProperties: {
                            type: 'array',
                            items: { type: 'string' },
                          },
                        },
                      },
                      required: ['attributes'],
                      additionalProperties: false,
                    },
                  },
                },
              },
              responses: { 200: { description: 'OK' } },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const context = {
    ...base.context,
    operations: [...base.context.operations, operation],
  };
  const plan = connectionEditPlan(
    { ...base, context },
    [{ kind: 'add-api-call', operation: operation.key }],
    false,
  );
  const input = {
    ...base,
    context,
    plan,
    stepId: plan.steps[0].id,
    requestMediaType: 'application/json',
  };
  const targetPointer = '/body/attributes/a~1b/0';
  const proposal = pending(input, [{ kind: 'binding-intent', targetPointer }]);
  const question = resolve(input, proposal).questions[0];
  const ready = resolve(input, proposal, [
    {
      kind: 'bind-source',
      questionId: question.id,
      sourceNodeId: 'source',
      sourcePointer: '/value',
    },
  ]);
  assert.equal(ready.bindings[0].targetPointer, targetPointer);
  for (const name of [
    'line\nbreak',
    'carriage\rreturn',
    'line\u2028separator',
    'paragraph\u2029separator',
  ]) {
    const pointer = `/body/attributes/${name}/0`;
    const value = resolve(
      input,
      pending(input, [{ kind: 'binding-intent', targetPointer: pointer }]),
    );
    assert.equal(value.questions[0].targetPointer, pointer);
  }
  for (const pointer of [
    '/body/unknown',
    '/body/attributes/a~1b/not-an-index',
    '/body/attributes/a~2b/0',
  ])
    assert.throws(() =>
      resolve(
        input,
        pending(input, [{ kind: 'binding-intent', targetPointer: pointer }]),
      ),
    );
});

test('a no-binding human decision is explicit, works without source candidates and never creates a dummy binding', async () => {
  const base = await apiCallPlanningFixture();
  const context = { ...base.context, capabilities: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'no-incoming-source',
      apiCalls: [],
      nativeNodes: [],
      edges: [],
      requirements: [],
    },
  });
  const plan = connectionEditPlan(
    { ...base, draft, context },
    [{ kind: 'add-api-call', operation: base.replacement.key }],
    false,
  );
  const input = { ...base, draft, context, plan, stepId: plan.steps[0].id };
  const proposal = {
    decision: {
      status: 'needs-clarification',
      questions: [{ kind: 'binding-intent', targetPointer: '/path/id' }],
      ...apiCallEvidence(input),
    },
  };
  const question = resolve(input, proposal).questions[0];
  assert.deepEqual(question.choices, []);
  const ready = resolve(input, proposal, [
    { kind: 'no-binding', questionId: question.id },
  ]);
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.bindings, []);
  assert.equal(
    describeWorkflowDraftApiCallArguments({ ...input, bindingPlan: ready })
      .hasLiteralInputs,
    true,
  );
  assert.throws(
    () =>
      resolve(input, apiCallBindingProposal(input), [
        { kind: 'no-binding', questionId: question.id },
      ]),
    /original unresolved/,
  );
});
