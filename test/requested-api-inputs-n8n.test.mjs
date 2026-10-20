import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createWorkflowDraft } from '@openapi-flow/core';
import {
  compileN8nWorkflowTemplate,
  createHttpRequestNode,
} from '@openapi-flow/n8n';
import { requestedApiInputFixture } from './fixtures/requested-api-inputs-fixture.mjs';

async function template(bound = false) {
  const fixture = await requestedApiInputFixture();
  const material = {
    ...fixture.material,
    requestedInputs: ['/body/config/enabled'],
    ...(bound
      ? {
          bindings: [
            {
              kind: 'node-output',
              sourceNodeId: 'seed',
              sourcePointer: '',
              targetPointer: '/body',
            },
          ],
        }
      : {}),
  };
  const context = { ...fixture.input.context, messages: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'presence-template',
      requirements: [],
      nativeNodes: [],
      apiCalls: [
        ...(bound
          ? [
              {
                id: 'seed',
                operation: fixture.seed.key,
                values: {},
                bindings: [],
              },
            ]
          : []),
        {
          id: material.callId,
          operation: material.operation.key,
          values: material.values,
          bindings: material.bindings,
          requestedInputs: material.requestedInputs,
          requestMediaType: material.requestMediaType,
        },
      ],
      edges: bound
        ? [{ from: 'seed', output: 'main', to: material.callId, input: 'main' }]
        : [],
    },
  });
  const result = compileN8nWorkflowTemplate({
    context,
    draft,
    name: '사용자 요청 입력 검증',
    deployments: [
      {
        documentId: material.operation.key.documentId,
        baseUrl: 'https://fixture.example.test',
        credentialBindings: {},
      },
    ],
  });
  return { result, material };
}

function execute(result, id, items, outputs = {}) {
  const node = result.workflow.nodes.find((entry) => entry.id === id);
  assert.ok(node);
  return vm.runInNewContext(`(function(){${node.parameters.jsCode}})()`, {
    $input: { all: () => items },
    $: (name) => ({
      all: () => {
        assert.ok(Object.hasOwn(outputs, name), name);
        return outputs[name];
      },
    }),
  });
}

test('strict HTTP compilation rejects an omitted scenario input even when caller falsely marks unresolvedInputs empty', async () => {
  const { material } = await requestedApiInputFixture();
  assert.throws(
    () =>
      createHttpRequestNode({
        operation: material.operation,
        arguments: {
          ...material,
          requestedInputs: ['/query/filter'],
          unresolvedInputs: [],
        },
        position: [0, 0],
        baseUrl: 'https://fixture.example.test',
        credentialBindings: {},
      }),
    /missing scenario-requested inputs.*filter/,
  );
  assert.doesNotThrow(() =>
    createHttpRequestNode({
      operation: material.operation,
      arguments: {
        ...material,
        requestedInputs: ['/query/filter'],
        values: { query: { filter: '' } },
        unresolvedInputs: [],
      },
      position: [0, 0],
      baseUrl: 'https://fixture.example.test',
      credentialBindings: {},
    }),
  );
});

test('template preflight enforces requested optional descendants independently from original OAS', async () => {
  const { result } = await template();
  const slot = result.inputSlots[0];
  assert.equal(slot.targetPointer, '/body');
  assert.deepEqual(slot.requestedInputs, ['/body/config/enabled']);
  assert.equal(result.requestInputsReady, false);
  assert.match(
    result.guide,
    /사용자 요청으로 포함할 입력.*\/body\/config\/enabled/,
  );
  const payload = (value) => [
    { json: { revision: result.revision, values: { [slot.id]: value } } },
  ];
  assert.throws(
    () => execute(result, 'openapi-flow-preflight', payload({ config: {} })),
    /omits scenario-requested inputs.*enabled/,
  );
  const actual = payload({ config: { enabled: false } });
  const ready = execute(result, 'openapi-flow-preflight', actual);
  const materialized = execute(result, 'search-materialize', [], {
    '입력 사전 검사': ready,
  });
  assert.deepEqual(JSON.parse(materialized[0].json.body.value), {
    config: { enabled: false },
  });
});

test('after a parent response binding, final materialization rejects missing scenario input although the OAS accepts it', async () => {
  const { result } = await template(true);
  assert.deepEqual(result.inputSlots, []);
  const ready = execute(result, 'openapi-flow-preflight', [
    { json: { revision: result.revision, values: {} } },
  ]);
  const outputs = (body) => ({
    '입력 사전 검사': ready,
    'Request seed': [
      {
        json: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body,
        },
      },
    ],
  });
  assert.throws(
    () => execute(result, 'search-materialize', [], outputs({ config: {} })),
    /omits scenario-requested inputs.*enabled/,
  );
  const complete = execute(
    result,
    'search-materialize',
    [],
    outputs({ config: { enabled: false } }),
  );
  assert.deepEqual(JSON.parse(complete[0].json.body.value), {
    config: { enabled: false },
  });
});
