import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  createWorkflowDraft,
  collectDeferredApiInputSlots,
  applyDraftChangeSet,
} from '@openapi-flow/core';
import {
  compileN8nWorkflowTemplate,
  createHttpRequestNode,
  createJsonOutputCapability,
} from '@openapi-flow/n8n';
import { z } from 'zod';
import {
  workflowTemplateFixture,
  actualTemplateInputs,
} from './fixtures/workflow-template-fixture.mjs';
import { deferredInputMaterial } from './fixtures/deferred-api-input-fixture.mjs';

function execute(result, id, items, outputs = {}, restricted = false) {
  const node = result.workflow.nodes.find((node) => node.id === id);
  assert.ok(node, id);
  return vm.runInNewContext(
    `${restricted ? 'Object.defineProperty=()=>({});Object.defineProperties=()=>({});Object.getPrototypeOf=()=>({});Reflect.getPrototypeOf=()=>({});' : ''}(function(){${node.parameters.jsCode}})()`,
    {
      $input: { all: () => items },
      $: (name) => ({
        all: () => {
          assert.ok(
            Object.hasOwn(outputs, name),
            'Missing fixture output ' + name,
          );
          return outputs[name];
        },
      }),
    },
  );
}
const json = (value) => JSON.parse(JSON.stringify(value));
function payload(result, values) {
  return [{ json: { revision: result.revision, values } }];
}

test('template exports one revision with empty actual inputs, original slots, SDK mapping and Korean guide', async () => {
  const fixture = await workflowTemplateFixture();
  const before = globalThis.structuredClone(fixture.draft);
  const result = compileN8nWorkflowTemplate(fixture);
  assert.equal(result.revision, 0);
  assert.equal(result.inputSlots.length, 6);
  assert.equal(result.triggerConnected, true);
  assert.equal(result.requestInputsReady, false);
  assert.equal(result.deploymentConfigured, true);
  assert.deepEqual(json(execute(result, 'openapi-flow-inputs', [])), [
    { json: { revision: 0, values: {} } },
  ]);
  assert.deepEqual(fixture.draft, before);
  assert.deepEqual(result.workflow.connections.Start.main[0], [
    { node: '입력 설정', type: 'main', index: 0 },
  ]);
  assert.deepEqual(result.workflow.connections['입력 설정'].main[0], [
    { node: '입력 사전 검사', type: 'main', index: 0 },
  ]);
  assert.deepEqual(
    result.workflow.connections['입력 사전 검사'].main[0].map(
      (edge) => edge.node,
    ),
    ['Materialize seed', 'Materialize health'],
  );
  for (const slot of result.inputSlots) {
    assert.equal(slot.editNodeId, 'openapi-flow-inputs');
    assert.ok(result.guide.includes(slot.materializerNodeName));
    assert.equal(Object.hasOwn(slot, 'value'), false);
  }
  const note = result.workflow.nodes.find(
    (node) => node.id === 'openapi-flow-template-guide',
  );
  assert.equal(note.parameters.content, result.guide);
  assert.match(result.guide, /초안 버전: 0/);
  assert.match(result.guide, /보안 경계가 아닙니다/);
});

test('template linked item mode is explicit and reaches the request materializers', async () => {
  const fixture = await workflowTemplateFixture();
  assert.throws(
    () => compileN8nWorkflowTemplate({ ...fixture, itemMode: 'zip' }),
    /template.itemMode must be linked or omitted/,
  );
  const ordinary = compileN8nWorkflowTemplate(fixture);
  const linked = compileN8nWorkflowTemplate({ ...fixture, itemMode: 'linked' });
  const source = (result) =>
    result.workflow.nodes.find((node) => node.id === 'submit-materialize')
      .parameters.jsCode;
  assert.match(source(ordinary), /requires an unambiguous single JSON item/);
  assert.match(source(linked), /itemMatching\(inputIndex\)/);
  assert.match(source(linked), /pairedItem:\{item:inputIndex\}/);
  assert.deepEqual(linked.workflow.connections, ordinary.workflow.connections);
});

test('preflight rejects missing, wrong-typed, extra or stale inputs before any business root', async () => {
  const result = compileN8nWorkflowTemplate(await workflowTemplateFixture());
  const values = actualTemplateInputs(result.inputSlots);
  assert.throws(
    () => execute(result, 'openapi-flow-preflight', payload(result, {})),
    /Workflow inputs.*declared slots/,
  );
  const quantity = result.inputSlots.find(
    (slot) => slot.targetPointer === '/body/quantity',
  );
  const labels = result.inputSlots.find(
    (slot) => slot.targetPointer === '/body/labels',
  );
  for (const invalid of [
    { ...values, [quantity.id]: '0' },
    { ...values, [quantity.id]: 101 },
    { ...values, [labels.id]: [] },
    { ...values, unknown: 'value' },
  ])
    assert.throws(
      () => execute(result, 'openapi-flow-preflight', payload(result, invalid)),
      /Workflow inputs.*declared slots/,
    );
  assert.throws(
    () =>
      execute(result, 'openapi-flow-preflight', [
        { json: { revision: 1, values } },
      ]),
    /stale workflow input revision/,
  );
  assert.throws(
    () => execute(result, 'openapi-flow-preflight', []),
    /exactly one JSON item/,
  );
  assert.equal(
    execute(result, 'openapi-flow-preflight', payload(result, values)).length,
    1,
  );
});

test('request materializers preserve literal input types and only bind the declared response value', async () => {
  const result = compileN8nWorkflowTemplate(await workflowTemplateFixture());
  const values = actualTemplateInputs(result.inputSlots);
  const ready = execute(
    result,
    'openapi-flow-preflight',
    payload(result, values),
  );
  const outputs = { '입력 사전 검사': ready };
  assert.equal(
    execute(result, 'seed-materialize', [], outputs)[0].json.url,
    'https://fixture.example.test/seed?id=input-actual',
  );
  outputs['Request seed'] = [
    {
      json: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { id: 'response/actual' },
      },
    },
  ];
  const request = execute(result, 'submit-materialize', [], outputs)[0].json;
  assert.equal(
    request.url,
    'https://fixture.example.test/submit/response%2Factual',
  );
  assert.deepEqual(JSON.parse(request.body.value), {
    quantity: 0,
    enabled: false,
    labels: ['={{ this is literal data }}'],
    metadata: { 0: 'actual' },
    nullable: null,
  });
  outputs['Request seed'][0].json.body.id = 42;
  assert.throws(
    () => execute(result, 'submit-materialize', [], outputs),
    /does not match.*OAS/,
  );
  assert.throws(
    () =>
      execute(result, 'submit-materialize', [], {
        '입력 사전 검사': payload({ ...result, revision: 1 }, values),
      }),
    /stale validated workflow inputs/,
  );
});

test('explicit initial values are editable data, with invalid or unknown values rejected at compilation', async () => {
  const fixture = await workflowTemplateFixture();
  const pending = compileN8nWorkflowTemplate(fixture);
  const inputValues = actualTemplateInputs(pending.inputSlots);
  const supplied = compileN8nWorkflowTemplate({ ...fixture, inputValues });
  assert.equal(supplied.requestInputsReady, true);
  assert.deepEqual(
    json(execute(supplied, 'openapi-flow-inputs', []))[0].json.values,
    inputValues,
  );
  assert.throws(
    () =>
      compileN8nWorkflowTemplate({
        ...fixture,
        inputValues: { unknown: 'bad' },
      }),
    /undeclared or stale/,
  );
  assert.throws(
    () =>
      compileN8nWorkflowTemplate({
        ...fixture,
        inputValues: { [pending.inputSlots[0].id]: { invalid: 'type' } },
      }),
    /violates.*OAS/,
  );
});

test('unresolved decisions and omitted deployment disconnect only Start and keep the entire DAG', async () => {
  const fixture = await workflowTemplateFixture();
  const missing = compileN8nWorkflowTemplate({
    ...fixture,
    deployments: undefined,
  });
  assert.equal(missing.triggerConnected, false);
  assert.equal(missing.deploymentConfigured, false);
  assert.equal(missing.workflow.active, false);
  assert.equal(Object.hasOwn(missing.workflow.connections, 'Start'), false);
  assert.equal(
    missing.workflow.connections['Request seed'].main[0][0].node,
    'Materialize submit',
  );
  assert.match(missing.guide, /Start 연결을 끊었습니다/);
  fixture.context.messages = [{ id: 'm1', text: 'Confirm purpose' }];
  const { draft } = applyDraftChangeSet({
    ...fixture,
    changeSet: {
      baseRevision: 0,
      changes: [
        {
          kind: 'set-requirement',
          requirement: {
            id: 'purpose',
            text: '목적 확인 필요',
            state: 'deferred',
            scope: { kind: 'nodes', nodeIds: ['seed'] },
            sourceMessageIds: ['m1'],
          },
        },
      ],
    },
  });
  const unresolved = compileN8nWorkflowTemplate({ ...fixture, draft });
  assert.equal(unresolved.triggerConnected, false);
  assert.equal(
    unresolved.draftReadiness.nodes.find((node) => node.nodeId === 'health')
      .planningStatus,
    'ready',
  );
  assert.match(unresolved.guide, /목적 확인 필요/);
});

test('template validates combined initial fields against the complete original request before any call', async () => {
  const material = await deferredInputMaterial(
    {
      type: 'object',
      additionalProperties: false,
      required: ['a', 'b'],
      properties: { a: { type: 'integer' }, b: { type: 'integer' } },
      not: {
        properties: { a: { const: 1 }, b: { const: 2 } },
        required: ['a', 'b'],
      },
    },
    { values: { body: {} } },
  );
  const context = {
    operations: [material.operation],
    capabilities: [],
    messages: [],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'combined',
      requirements: [],
      apiCalls: [
        {
          id: material.callId,
          operation: material.operation.key,
          values: material.values,
          bindings: [],
        },
      ],
      nativeNodes: [],
      edges: [],
    },
  });
  const result = compileN8nWorkflowTemplate({
    draft,
    context,
    name: 'Combined',
    deployments: [
      { documentId: 'inputs', baseUrl: 'https://fixture.example.test' },
    ],
  });
  const values = Object.fromEntries(
    result.inputSlots.map((slot) => [
      slot.id,
      slot.targetPointer.endsWith('/a') ? 1 : 2,
    ]),
  );
  assert.throws(
    () => execute(result, 'openapi-flow-preflight', payload(result, values)),
    /Runtime request.*OAS/,
  );
});

test('native-only templates need no OAS and preserve registered native parameters', () => {
  const capability = createJsonOutputCapability({
    name: 'context',
    description: 'Explicit values',
    parametersSchema: z.strictObject({ enabled: z.boolean() }),
  });
  const context = { operations: [], capabilities: [capability], messages: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'native-only',
      requirements: [],
      apiCalls: [],
      nativeNodes: [
        {
          id: 'context',
          capability: 'context',
          parameters: { enabled: false },
        },
      ],
      edges: [],
    },
  });
  const result = compileN8nWorkflowTemplate({
    draft,
    context,
    name: 'Native only',
  });
  assert.equal(result.inputSlots.length, 0);
  assert.equal(result.requestInputsReady, true);
  assert.equal(result.triggerConnected, true);
  assert.equal(result.nodeMappings[0].kind, 'native');
  assert.equal(
    execute(result, 'openapi-flow-preflight', payload(result, {})).length,
    1,
  );
});

test('partial input projection keeps the original if predicate and validates the complete branch before HTTP', async () => {
  const material = await deferredInputMaterial(
    {
      type: 'object',
      required: ['kind', 'amount'],
      properties: { kind: { type: 'string' }, amount: {} },
      if: { required: ['kind'], properties: { kind: { const: 'text' } } },
      then: { properties: { amount: { type: 'string' } } },
      else: { properties: { amount: { type: 'number' } } },
    },
    { values: { body: { amount: 0 } } },
  );
  const context = {
    operations: [material.operation],
    capabilities: [],
    messages: [],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'predicate',
      requirements: [],
      apiCalls: [
        {
          id: material.callId,
          operation: material.operation.key,
          values: material.values,
          bindings: [],
        },
      ],
      nativeNodes: [],
      edges: [],
    },
  });
  const result = compileN8nWorkflowTemplate({
    draft,
    context,
    name: 'Predicate',
    deployments: [
      { documentId: 'inputs', baseUrl: 'https://fixture.example.test' },
    ],
  });
  assert.equal(result.inputSlots[0].targetPointer, '/body/kind');
  assert.equal(
    execute(
      result,
      'openapi-flow-preflight',
      payload(result, { [result.inputSlots[0].id]: 'number' }),
    ).length,
    1,
  );
  assert.throws(
    () =>
      execute(
        result,
        'openapi-flow-preflight',
        payload(result, { [result.inputSlots[0].id]: 'text' }),
      ),
    /Runtime request.*OAS/,
  );
});

test('strict request entrypoint still refuses unresolved or missing actual inputs', async () => {
  const fixture = await workflowTemplateFixture();
  const operation = fixture.context.operations.find(
    (operation) => operation.path === '/seed',
  );
  for (const unresolvedInputs of [[], ['/query/id']])
    assert.throws(
      () =>
        createHttpRequestNode({
          operation,
          arguments: {
            callId: 'seed',
            values: {},
            bindings: [],
            unresolvedInputs,
          },
          position: [0, 0],
        }),
      /missing|unresolved/,
    );
});

test('slot assignment runs in the restricted Code environment without prototype mutation helpers', async () => {
  const result = compileN8nWorkflowTemplate(await workflowTemplateFixture());
  const ready = execute(
    result,
    'openapi-flow-preflight',
    payload(result, actualTemplateInputs(result.inputSlots)),
    {},
    true,
  );
  const output = execute(
    result,
    'seed-materialize',
    [],
    { '입력 사전 검사': ready },
    true,
  );
  assert.equal(
    output[0].json.url,
    'https://fixture.example.test/seed?id=input-actual',
  );
});

test('prototype-looking JSON keys remain ordinary OAS data in runtime slot assignment', async () => {
  const material = await deferredInputMaterial(
    {
      type: 'object',
      required: ['__proto__'],
      additionalProperties: false,
      properties: JSON.parse(
        '{"__proto__":{"type":"object","required":["kept"],"properties":{"kept":{"type":"boolean"}},"additionalProperties":false}}',
      ),
    },
    { values: { body: {} } },
  );
  const context = {
    operations: [material.operation],
    capabilities: [],
    messages: [],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'prototype-key',
      requirements: [],
      apiCalls: [
        {
          id: material.callId,
          operation: material.operation.key,
          values: material.values,
          bindings: [],
        },
      ],
      nativeNodes: [],
      edges: [],
    },
  });
  const result = compileN8nWorkflowTemplate({
    draft,
    context,
    name: 'JSON keys',
    deployments: [
      { documentId: 'inputs', baseUrl: 'https://fixture.example.test' },
    ],
  });
  assert.equal(result.inputSlots[0].targetPointer, '/body/__proto__');
  const values = { [result.inputSlots[0].id]: { kept: false } };
  const ready = execute(
    result,
    'openapi-flow-preflight',
    payload(result, values),
    {},
    true,
  );
  const request = execute(
    result,
    'submit-materialize',
    [],
    { '입력 사전 검사': ready },
    true,
  )[0].json;
  const body = JSON.parse(request.body.value);
  assert.ok(Object.hasOwn(body, '__proto__'));
  assert.deepEqual(body.__proto__, { kept: false });
  assert.equal(Object.hasOwn({}, 'kept'), false);
});

test('empty drafts, reserved identities, stale operation snapshots and unknown deployments are not repaired', async () => {
  const fixture = await workflowTemplateFixture();
  assert.throws(
    () => compileN8nWorkflowTemplate({ ...fixture, deployments: [null] }),
    /object/,
  );
  assert.throws(
    () =>
      compileN8nWorkflowTemplate({
        ...fixture,
        deployments: [{ documentId: 'template-fixture', baseUrl: 'invalid' }],
      }),
    /baseUrl|absolute|http/,
  );
  assert.throws(
    () =>
      compileN8nWorkflowTemplate({
        ...fixture,
        deployments: [{ documentId: 'unknown' }],
      }),
    /unused documentId/,
  );
  assert.throws(
    () =>
      compileN8nWorkflowTemplate({
        ...fixture,
        deployments: [...fixture.deployments, ...fixture.deployments],
      }),
    /distinct documentIds/,
  );
  const stale = globalThis.structuredClone(fixture.draft);
  stale.apiCalls[0].operation.snapshotId = 'stale';
  assert.throws(
    () => compileN8nWorkflowTemplate({ ...fixture, draft: stale }),
    /original OAS|Unrecognized/,
  );
  const empty = createWorkflowDraft({
    context: fixture.context,
    content: {
      id: 'empty',
      requirements: [],
      apiCalls: [],
      nativeNodes: [],
      edges: [],
    },
  });
  assert.throws(
    () =>
      compileN8nWorkflowTemplate({
        ...fixture,
        draft: empty,
        deployments: undefined,
      }),
    /at least one/,
  );
  const material = await deferredInputMaterial(
    { type: 'string' },
    { callId: 'openapi-flow-inputs' },
  );
  const context = {
    operations: [material.operation],
    capabilities: [],
    messages: [],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'collision',
      requirements: [],
      apiCalls: [
        {
          id: material.callId,
          operation: material.operation.key,
          values: {},
          bindings: [],
        },
      ],
      nativeNodes: [],
      edges: [],
    },
  });
  assert.throws(
    () => compileN8nWorkflowTemplate({ draft, context, name: 'Collision' }),
    /system node/,
  );
  assert.ok(collectDeferredApiInputSlots({ materials: [material] }).length);
});
