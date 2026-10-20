import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
  describeWorkflowDraftApiCallPlanning,
  createWorkflowDraftApiCallBindingsSchema,
  resolveWorkflowDraftApiCallBindings,
  describeWorkflowDraftApiCallArguments,
  createWorkflowDraftApiCallArgumentsSchema,
  resolveWorkflowDraftApiCallArguments,
  assembleWorkflowDraftEdit,
  stageWorkflowDraftEdit,
} from '@openapi-flow/core';
import {
  generateWorkflowDraftApiCallArguments,
  planWorkflowDraftApiCallBindings,
  WorkflowDraftApiCallPlanningError,
} from '@openapi-flow/langchain';
import { compileN8nWorkflowTemplate } from '@openapi-flow/n8n';
import {
  apiCallPlanningFixture,
  apiCallEvidence,
  apiCallBindingProposal,
  sourceIdMapping,
  apiCallBindingPlan,
  apiCallArgumentsProposal,
  apiCallPlanningModel,
} from './fixtures/workflow-draft-api-call-planning-fixture.mjs';
import { connectionEditPlan } from './fixtures/workflow-draft-connection-edit-fixture.mjs';
import { assemblyBodyValue } from './fixtures/workflow-draft-edit-assembly-fixture.mjs';

test('new API instance uses the selected OAS, code ID and actual source, without changing unrelated content', async () => {
  const input = await apiCallPlanningFixture();
  const original = globalThis.structuredClone(input.draft);
  const description = describeWorkflowDraftApiCallPlanning(input);
  assert.equal(description.nodeId, input.plan.steps[0].newNodeId);
  assert.deepEqual(description.operation.key, input.replacement.key);
  assert.equal(
    description.sources.values.some(
      (source) => source.nodeId === description.nodeId,
    ),
    false,
  );
  const bindingPlan = apiCallBindingPlan(input);
  const result = await generateWorkflowDraftApiCallArguments({
    ...input,
    bindingPlan,
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.inputMode, 'provided');
  assert.deepEqual(result.arguments.values, {});
  assert.equal(result.arguments.bindings[0].sourceNodeId, 'source');
  assert.deepEqual(result.sources[0].quote, input.context.messages[1].text);
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
    connections: [
      {
        stepIds: [input.stepId],
        kind: 'add-edge',
        edge: {
          from: 'source',
          output: 'main',
          to: description.nodeId,
          input: 'main',
        },
      },
    ],
  });
  assert.deepEqual(
    candidate.draft.apiCalls.filter((call) => call.id !== description.nodeId),
    original.apiCalls,
  );
  assert.deepEqual(candidate.draft.nativeNodes, original.nativeNodes);
  assert.deepEqual(
    candidate.draft.edges.filter((edge) => edge.to !== description.nodeId),
    original.edges,
  );
  assert.deepEqual(input.draft, original);
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({ ...input, resolutions: [result.resolution] }),
    /ancestor|upstream|source|dependency/i,
  );
});

test('replacement keeps the existing identity but does not reuse old same-name values or advertise the old output', async () => {
  const input = await apiCallPlanningFixture('replace-api-operation');
  const description = describeWorkflowDraftApiCallPlanning(input);
  assert.equal(description.nodeId, 'independent');
  assert.deepEqual(description.previousCall.values, {
    path: { id: 'independent-id' },
  });
  assert.equal(
    description.sources.values.some(
      (source) => source.nodeId === 'independent',
    ),
    false,
  );
  const bindingPlan = apiCallBindingPlan(input, []);
  const result = await generateWorkflowDraftApiCallArguments({
    ...input,
    bindingPlan,
    model: apiCallPlanningModel([apiCallArgumentsProposal(input)]),
  });
  assert.equal(result.status, 'needs-input');
  assert.deepEqual(result.arguments.values, {});
  assert.deepEqual(
    result.requirements.map((item) => item.targetPointer),
    ['/path/id'],
  );
  assert.equal(Object.hasOwn(result, 'resolution'), false);
  assert.deepEqual(
    input.draft.apiCalls.find((call) => call.id === 'independent').values,
    { path: { id: 'independent-id' } },
  );
});

test('actual implementation schema excludes bound and confirmed fields at nested locations and preserves JSON types', async () => {
  const base = await apiCallPlanningFixture('add-api-call', 'producer', true, {
    body: assemblyBodyValue,
  });
  const input = { ...base, requestMediaType: 'application/json' };
  const bindingPlan = apiCallBindingPlan(input, [
    sourceIdMapping,
    {
      targetPointer: '/body/config/count',
      sourceNodeId: 'config',
      sourcePointer: '/count',
    },
  ]);
  const args = {
    ...input,
    bindingPlan,
    confirmedInputs: [
      {
        callId: input.plan.steps[0].newNodeId,
        operation: input.producer.key,
        targetPointer: '/body/name',
        value: 'confirmed-name',
      },
    ],
  };
  const values = { body: globalThis.structuredClone(assemblyBodyValue) };
  delete values.body.name;
  delete values.body.config.count;
  const schema = createWorkflowDraftApiCallArgumentsSchema(args);
  assert.equal(
    schema.safeParse(
      apiCallArgumentsProposal(input, { ...values, path: { id: 'wrong' } }),
    ).success,
    false,
  );
  assert.equal(
    schema.safeParse(
      apiCallArgumentsProposal(input, {
        body: { ...values.body, name: 'wrong' },
      }),
    ).success,
    false,
  );
  assert.equal(
    schema.safeParse(
      apiCallArgumentsProposal(input, {
        body: { ...values.body, config: { ...values.body.config, count: 3 } },
      }),
    ).success,
    false,
  );
  const model = apiCallPlanningModel([apiCallArgumentsProposal(input, values)]);
  const result = await generateWorkflowDraftApiCallArguments({
    ...args,
    model,
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.arguments.values.body.name, 'confirmed-name');
  assert.equal(result.arguments.values.body.config.enabled, false);
  assert.equal(result.arguments.values.body.nullable, null);
  assert.equal(result.arguments.values.body.marker, '={{ literal }}');
  assert.equal(
    Object.hasOwn(result.arguments.values.body.config, 'count'),
    false,
  );
  assert.equal(model.requests.length, 1);
  assert.equal(model.requests[0].messages[0].getType(), 'system');
  assert.equal(model.requests[0].messages[1].getType(), 'human');
});

test('unknown required values become original-OAS questions or explicitly opted-in runtime slots, not placeholder requests', async () => {
  const input = await apiCallPlanningFixture();
  const bindingPlan = apiCallBindingPlan(input, []);
  const proposed = apiCallArgumentsProposal(input);
  const args = { ...input, bindingPlan };
  const pending = resolveWorkflowDraftApiCallArguments({
    ...args,
    fingerprint: describeWorkflowDraftApiCallArguments(args).fingerprint,
    proposal: proposed,
  });
  assert.equal(pending.status, 'needs-input');
  assert.equal(Object.hasOwn(pending, 'resolution'), false);
  const runtime = { ...args, allowRuntimeInputs: true };
  const deferred = resolveWorkflowDraftApiCallArguments({
    ...runtime,
    fingerprint: describeWorkflowDraftApiCallArguments(runtime).fingerprint,
    proposal: proposed,
  });
  assert.equal(deferred.status, 'ready');
  assert.equal(deferred.inputMode, 'runtime-inputs');
  assert.deepEqual(deferred.resolution.values, {});
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [deferred.resolution],
  });
  const template = compileN8nWorkflowTemplate({
    draft: candidate.draft,
    context: input.context,
    name: 'Explicit runtime input contract',
  });
  assert.ok(
    template.inputSlots.some(
      (slot) =>
        slot.callId === input.plan.steps[0].newNodeId &&
        slot.targetPointer === '/path/id',
    ),
  );
  const confirmed = {
    ...args,
    confirmedInputs: [
      {
        callId: input.plan.steps[0].newNodeId,
        operation: input.replacement.key,
        targetPointer: '/path/id',
        value: 'supplied-id',
      },
    ],
  };
  const ready = await generateWorkflowDraftApiCallArguments(confirmed);
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.arguments.values, { path: { id: 'supplied-id' } });
  assert.throws(
    () =>
      describeWorkflowDraftApiCallArguments({
        ...args,
        allowRuntimeInputs: 'true',
      }),
    /boolean/,
  );
});

test('binding questions are stable and cannot produce a partially applicable call', async () => {
  const input = await apiCallPlanningFixture();
  const description = describeWorkflowDraftApiCallPlanning(input);
  const proposal = {
    decision: {
      status: 'needs-clarification',
      mappings: [],
      questions: [{ kind: 'binding-intent', targetPointer: '/path/id' }],
      ...apiCallEvidence(input),
    },
  };
  const model = apiCallPlanningModel([proposal]);
  const result = await planWorkflowDraftApiCallBindings({ ...input, model });
  assert.equal(result.status, 'needs-clarification');
  assert.equal(Object.hasOwn(result, 'bindings'), false);
  assert.equal(Object.hasOwn(result, 'resolution'), false);
  const second = resolveWorkflowDraftApiCallBindings({
    ...input,
    fingerprint: description.fingerprint,
    proposal,
  });
  assert.equal(result.questions[0].id, second.questions[0].id);
  assert.throws(
    () =>
      describeWorkflowDraftApiCallArguments({ ...input, bindingPlan: result }),
    /ready bindingPlan/,
  );
  assert.equal(model.requests.length, 1);
});

test('binding boundary rejects invented or self sources, wrong body pointers, types, overlapping targets and stale evidence', async () => {
  const input = await apiCallPlanningFixture();
  const fingerprint = describeWorkflowDraftApiCallPlanning(input).fingerprint;
  for (const mappings of [
    [{ ...sourceIdMapping, sourceNodeId: 'imagined' }],
    [{ ...sourceIdMapping, sourceNodeId: input.plan.steps[0].newNodeId }],
    [{ ...sourceIdMapping, sourcePointer: '/body/value' }],
    [{ ...sourceIdMapping, sourceNodeId: 'config', sourcePointer: '/count' }],
    [{ ...sourceIdMapping, targetPointer: '/path/imagined' }],
    [sourceIdMapping, sourceIdMapping],
  ])
    assert.throws(() =>
      resolveWorkflowDraftApiCallBindings({
        ...input,
        fingerprint,
        proposal: apiCallBindingProposal(input, mappings),
      }),
    );
  const schema = createWorkflowDraftApiCallBindingsSchema(input);
  assert.equal(
    schema.safeParse({
      decision: {
        ...apiCallBindingProposal(input).decision,
        operation: input.lookup.key,
      },
    }).success,
    false,
  );
  assert.equal(
    schema.safeParse({
      decision: {
        ...apiCallBindingProposal(input).decision,
        sourceMessageIds: ['initial'],
      },
    }).success,
    false,
  );
});

test('binding receipts and argument fingerprints cannot be forged or automatically rebased', async () => {
  const input = await apiCallPlanningFixture();
  const bindingPlan = apiCallBindingPlan(input);
  assert.throws(
    () =>
      describeWorkflowDraftApiCallArguments({
        ...input,
        bindingPlan: { ...bindingPlan, bindings: [] },
      }),
    /actual validated proposal/,
  );
  assert.throws(
    () =>
      describeWorkflowDraftApiCallPlanning({
        ...input,
        resolutions: [
          { stepId: input.stepId, kind: 'api-call', values: {}, bindings: [] },
        ],
      }),
    /already has an explicit result/,
  );
  const args = { ...input, bindingPlan };
  const fingerprint = describeWorkflowDraftApiCallArguments(args).fingerprint;
  assert.throws(
    () =>
      resolveWorkflowDraftApiCallArguments({
        ...args,
        allowRuntimeInputs: true,
        fingerprint,
        proposal: apiCallArgumentsProposal(input),
      }),
    /fingerprint/,
  );
  const model = apiCallPlanningModel(
    [apiCallBindingProposal(input, [sourceIdMapping])],
    () => (input.context.messages[1].text += ' Changed during generation.'),
  );
  await assert.rejects(
    planWorkflowDraftApiCallBindings({ ...input, model }),
    (error) =>
      error instanceof WorkflowDraftApiCallPlanningError &&
      /fingerprint|stale|context/i.test(error.cause.message),
  );
  assert.equal(model.requests.length, 1);
});

test('request media is resolved only from declared OAS choices before either planning stage', async () => {
  const base = await apiCallPlanningFixture('add-api-call', 'producer', false, {
    body: { sku: 'sku-0' },
  });
  assert.throws(
    () => describeWorkflowDraftApiCallPlanning(base),
    /requestMediaType must explicitly select/,
  );
  assert.throws(
    () =>
      describeWorkflowDraftApiCallPlanning({
        ...base,
        requestMediaType: 'application/xml',
      }),
    /has no application\/xml/,
  );
  const input = {
    ...base,
    requestMediaType: 'application/x-www-form-urlencoded',
  };
  const bindingPlan = apiCallBindingPlan(input, [sourceIdMapping]);
  const model = apiCallPlanningModel([
    apiCallArgumentsProposal(input, { body: { sku: 'sku-0' } }),
  ]);
  const result = await generateWorkflowDraftApiCallArguments({
    ...input,
    bindingPlan,
    model,
  });
  assert.equal(result.status, 'ready');
  assert.equal(
    result.resolution.requestMediaType,
    'application/x-www-form-urlencoded',
  );
  assert.deepEqual(result.resolution.values, { body: { sku: 'sku-0' } });
  const noBody = await apiCallPlanningFixture();
  assert.throws(
    () =>
      describeWorkflowDraftApiCallPlanning({
        ...noBody,
        requestMediaType: 'application/json',
      }),
    /has no requestBody/,
  );
});

test('two roles of one API remain distinct code-owned instances with independently planned values', async () => {
  const input = await apiCallPlanningFixture(
    'add-api-call',
    'replacement',
    false,
    [{ path: { id: '0' } }, { path: { id: '1' } }],
  );
  const message = input.context.messages[1];
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: ['First lookup role.', 'Second lookup role.'].map(
        (instruction) => ({
          kind: 'add-api-call',
          operation: input.replacement.key,
          instruction,
          sources: [
            { kind: 'message', messageId: message.id, quote: message.text },
          ],
        }),
      ),
    },
  });
  const resolutions = [];
  for (const [index, step] of plan.steps.entries()) {
    const current = { ...input, plan, stepId: step.id, resolutions };
    const bindingPlan = apiCallBindingPlan(current, []);
    const model = apiCallPlanningModel([
      apiCallArgumentsProposal(current, { path: { id: String(index) } }),
    ]);
    const result = await generateWorkflowDraftApiCallArguments({
      ...current,
      bindingPlan,
      model,
    });
    assert.equal(result.status, 'ready');
    resolutions.push(result.resolution);
  }
  assert.notEqual(plan.steps[0].newNodeId, plan.steps[1].newNodeId);
  const result = assembleWorkflowDraftEdit({ ...input, plan, resolutions });
  assert.equal(result.draft.apiCalls.at(-2).values.path.id, '0');
  assert.equal(result.draft.apiCalls.at(-1).values.path.id, '1');
});

test('pending replacements do not provide stale source output contracts to a new API plan', async () => {
  const input = await apiCallPlanningFixture();
  const plan = connectionEditPlan(input, [
    {
      kind: 'replace-api-operation',
      nodeId: 'source',
      operation: input.replacement.key,
    },
    { kind: 'add-api-call', operation: input.lookup.key },
  ]);
  const current = { ...input, plan, stepId: plan.steps[1].id };
  const description = describeWorkflowDraftApiCallPlanning(current);
  assert.ok(
    stageWorkflowDraftEdit(current).blockedSourceNodeIds.includes('source'),
  );
  const source = description.sources.values.find(
    (source) => source.nodeId === 'source',
  );
  assert.deepEqual(source.operation.key, input.replacement.key);
  assert.equal(source.preparation.status, 'request-pending');
  assert.equal(Object.hasOwn(source.preparation, 'request'), false);
  assert.throws(() => apiCallBindingPlan(current));
});

test('no-input operations use zero model calls in both stages; no request fields are fabricated', async () => {
  const catalog = await createApiCatalog([
    {
      id: 'no-input',
      spec: {
        openapi: '3.1.0',
        info: { title: 'No input', version: '1' },
        paths: {
          '/ping': { get: { responses: { 200: { description: 'pong' } } } },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(
    catalog,
    catalog.operations.map((item) => item.key),
  );
  const context = {
    operations: [operation],
    capabilities: [],
    messages: [{ id: 'request', text: 'Add a ping call.' }],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'empty',
      apiCalls: [],
      nativeNodes: [],
      requirements: [],
      edges: [],
    },
  });
  const base = { draft, context, requestMessageIds: ['request'] };
  const plan = createWorkflowDraftEditPlan({
    ...base,
    options: { includeExplanations: true },
    proposal: {
      decisions: [
        {
          kind: 'add-api-call',
          operation: operation.key,
          instruction: 'Add ping.',
          sources: [
            {
              kind: 'message',
              messageId: 'request',
              quote: 'Add a ping call.',
            },
          ],
          explanation: {
            reason: 'The request asks for ping.',
            evidence: [
              {
                kind: 'message',
                messageId: 'request',
                quote: 'Add a ping call.',
              },
            ],
          },
        },
      ],
    },
  });
  const input = { ...base, plan, stepId: plan.steps[0].id, resolutions: [] };
  const wire = z.toJSONSchema(createWorkflowDraftApiCallBindingsSchema(input));
  assert.equal(JSON.stringify(wire).includes('needs-clarification'), false);
  assert.equal(JSON.stringify(wire).includes('"not"'), false);
  const bindingPlan = await planWorkflowDraftApiCallBindings(input);
  assert.equal(bindingPlan.status, 'ready');
  const result = await generateWorkflowDraftApiCallArguments({
    ...input,
    bindingPlan,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.resolution.values, {});
  assert.deepEqual(result.resolution.bindings, []);
  assert.equal(
    assembleWorkflowDraftEdit({ ...input, resolutions: [result.resolution] })
      .draft.apiCalls.length,
    1,
  );
});

test('typed failures retain original model outputs and transport failures are not retried', async () => {
  const input = await apiCallPlanningFixture();
  const output = apiCallBindingProposal(input, [
    { ...sourceIdMapping, sourcePointer: '/imagined' },
  ]);
  const model = apiCallPlanningModel([output]);
  await assert.rejects(
    planWorkflowDraftApiCallBindings({ ...input, model }),
    (error) => {
      assert.ok(error instanceof WorkflowDraftApiCallPlanningError);
      assert.equal(error.failure.stage, 'bindings');
      assert.deepEqual(error.failure.output, output);
      assert.ok(error.cause);
      return true;
    },
  );
  assert.equal(model.requests.length, 1);
  const bindingPlan = apiCallBindingPlan(input, []);
  const badValues = apiCallArgumentsProposal(input, { path: { id: 123 } });
  await assert.rejects(
    generateWorkflowDraftApiCallArguments({
      ...input,
      bindingPlan,
      model: apiCallPlanningModel([badValues]),
    }),
    (error) =>
      error instanceof WorkflowDraftApiCallPlanningError &&
      error.failure.stage === 'arguments' &&
      error.failure.output === badValues,
  );
  const transport = new Error('Synthetic transport failure');
  const failingModel = apiCallPlanningModel([], () => {
    throw transport;
  });
  await assert.rejects(
    planWorkflowDraftApiCallBindings({ ...input, model: failingModel }),
    (error) => error === transport,
  );
  assert.equal(failingModel.requests.length, 1);
});

test('colliding operationRefs across OAS documents use the complete selected document and snapshot key', async () => {
  const base = await apiCallPlanningFixture(
    'add-api-call',
    'replacement',
    false,
    { query: { enabled: false } },
  );
  const catalog = await createApiCatalog([
    {
      id: 'other-domain',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Another domain', version: '1' },
        paths: {
          '/replacement/{id}': {
            get: {
              parameters: [
                {
                  in: 'path',
                  name: 'id',
                  required: true,
                  schema: { type: 'string' },
                },
                {
                  in: 'query',
                  name: 'enabled',
                  required: true,
                  schema: { type: 'boolean' },
                },
              ],
              responses: { 200: { description: 'Other domain output' } },
            },
          },
        },
      },
    },
  ]);
  const [otherOperation] = await resolveApiOperations(
    catalog,
    catalog.operations.map((item) => item.key),
  );
  assert.equal(
    otherOperation.key.operationRef,
    base.replacement.key.operationRef,
  );
  assert.notEqual(
    otherOperation.key.documentId,
    base.replacement.key.documentId,
  );
  const context = {
    ...base.context,
    operations: [...base.context.operations, otherOperation],
  };
  const plan = connectionEditPlan({ ...base, context }, [
    { kind: 'add-api-call', operation: otherOperation.key },
  ]);
  const input = { ...base, context, plan, stepId: plan.steps[0].id };
  const bindingPlan = apiCallBindingPlan(input);
  const result = await generateWorkflowDraftApiCallArguments({
    ...input,
    bindingPlan,
    model: apiCallPlanningModel([
      apiCallArgumentsProposal(input, { query: { enabled: false } }),
    ]),
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.arguments.values, { query: { enabled: false } });
  assert.deepEqual(
    describeWorkflowDraftApiCallPlanning(input).operation.key,
    otherOperation.key,
  );
  const newNodeId = plan.steps[0].newNodeId;
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
    connections: [
      {
        kind: 'add-edge',
        stepIds: [input.stepId],
        edge: { from: 'source', output: 'main', to: newNodeId, input: 'main' },
      },
    ],
  });
  assert.deepEqual(
    candidate.draft.apiCalls.find((call) => call.id === newNodeId).operation,
    otherOperation.key,
  );
  assert.deepEqual(
    candidate.draft.apiCalls.filter((call) => call.id !== newNodeId),
    base.draft.apiCalls,
  );
});
