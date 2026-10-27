import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import {
  StateGraph,
  StateSchema,
  START,
  END,
  MemorySaver,
} from '@langchain/langgraph';
import { z } from 'zod';
import {
  createWorkflowConnectionSession,
  applyWorkflowConnectionStep,
  describeWorkflowConnectionStep,
  validateWorkflowConnectionRevision,
  validateWorkflowConnectionMaterialRepairRequest,
  validateWorkflowConnectionMaterialRepairReceipt,
  finalizeWorkflowConnectionSession,
  createApiCatalog,
  resolveApiOperations,
} from '@openapi-flow/core';
import { planWorkflowConnectionRevision } from '@openapi-flow/langchain';
import {
  incrementalConnectionFixture,
  incrementalConnectionPatch,
  incrementalConnectionModelPatch,
} from './fixtures/incremental-connection-fixture.mjs';

function fixture() {
  const { source, goals, plan } = incrementalConnectionFixture();
  const first = createWorkflowConnectionSession({ ...source, goals });
  const applied = applyWorkflowConnectionStep({
    ...source,
    session: first,
    expected: describeWorkflowConnectionStep({ ...source, session: first })
      .expected,
    proposal: incrementalConnectionPatch({
      addEdges: plan.edges,
      addRootNodeIds: ['source'],
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  });
  assert.equal(applied.status, 'accepted');
  const before = { ...source, session: applied.session };
  return {
    source,
    goals,
    before,
    after: source,
    expected: describeWorkflowConnectionStep(before).expected,
  };
}

function revisionOutput(input) {
  return {
    decision: {
      kind: 'revise-connections',
      goals: [
        ...input.goals,
        {
          kind: 'precedence',
          before: 'detail',
          after: 'summary',
          factIds: ['intent'],
          reason: 'Summary needs the original detail result.',
        },
      ],
      graphChange: incrementalConnectionModelPatch(
        input.source,
        incrementalConnectionPatch({}),
      ),
    },
  };
}

function model(output, observe = () => {}) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages, config) {
          const call = {
            schema,
            options,
            payload: JSON.parse(messages[1].content),
            config,
          };
          calls.push(call);
          await observe(call);
          if (output instanceof Error) throw output;
          return globalThis.structuredClone(output);
        },
      };
    },
  };
}

test('one revision model call chooses only goals and explicit edge changes; code owns candidate identity, boundaries and impact', async () => {
  const input = fixture();
  const original = globalThis.structuredClone(input.before.session);
  const chat = model(revisionOutput(input));
  const result = await planWorkflowConnectionRevision({
    ...input,
    model: chat,
  });
  assert.equal(result.kind, 'revised-connections');
  assert.equal(chat.calls.length, 1);
  assert.equal(result.revision.inspection.ready, true);
  assert.deepEqual(result.revision.session.edges, original.edges);
  assert.deepEqual(input.before.session, original);
  assert.equal(
    chat.calls[0].payload.after.context.scenario,
    input.source.scenario,
  );
  assert.equal(
    JSON.stringify(chat.calls[0].schema).includes('sourceFingerprint'),
    false,
  );
  validateWorkflowConnectionRevision({
    ...input,
    proposal: result.revision.proposal,
    revision: result.revision,
  });
});

test('a material-origin request returns actual node/stage targets without changing goals, bindings or asking for technical HITL', async () => {
  const input = fixture();
  const output = {
    kind: 'replan-materials',
    targets: [{ stage: 'api-bindings', nodeId: 'price' }],
    factIds: ['intent'],
    reason:
      'Reconsider the price input source against the confirmed independent reads.',
  };
  const chat = model({ decision: output });
  const original = globalThis.structuredClone(input.before.session);
  const result = await planWorkflowConnectionRevision({
    ...input,
    model: chat,
  });
  assert.deepEqual(result.request, output);
  validateWorkflowConnectionMaterialRepairReceipt({
    ...input,
    receipt: result,
  });
  validateWorkflowConnectionMaterialRepairRequest({
    ...input,
    request: output,
  });
  assert.deepEqual(input.before.session, original);
  assert.equal(chat.calls.length, 1);
});

test('foreign stage ownership, missing node IDs, duplicate targets and changed facts cannot be repaired or substituted', async () => {
  for (const request of [
    {
      targets: [{ stage: 'native-parameters', nodeId: 'price' }],
      factIds: ['intent'],
    },
    {
      targets: [{ stage: 'api-bindings', nodeId: 'missing' }],
      factIds: ['intent'],
    },
    {
      targets: [
        { stage: 'api-bindings', nodeId: 'price' },
        { stage: 'api-bindings', nodeId: 'price' },
      ],
      factIds: ['intent'],
    },
    {
      targets: [{ stage: 'api-bindings', nodeId: 'price' }],
      factIds: ['foreign'],
    },
  ]) {
    const input = fixture();
    const chat = model({
      decision: {
        kind: 'replan-materials',
        reason: 'A bounded stage request.',
        ...request,
      },
    });
    await assert.rejects(
      planWorkflowConnectionRevision({ ...input, model: chat }),
    );
    assert.equal(chat.calls.length, 1);
  }
});

test('a material repair receipt cannot be reused for another replacement source or checkpoint expectation', async () => {
  const input = fixture();
  const chat = model({
    decision: {
      kind: 'replan-materials',
      targets: [{ stage: 'api-bindings', nodeId: 'price' }],
      factIds: ['intent'],
      reason: 'Review the selected original source.',
    },
  });
  const receipt = await planWorkflowConnectionRevision({
    ...input,
    model: chat,
  });
  const materials = globalThis.structuredClone(input.after.materials);
  materials.find(
    (material) => material.arguments.callId === 'price',
  ).arguments.bindings[0].sourceNodeId = 'detail';
  assert.throws(
    () =>
      validateWorkflowConnectionMaterialRepairReceipt({
        ...input,
        after: { ...input.after, materials },
        receipt,
      }),
    /different session, revision or replacement source/,
  );
  const changed = globalThis.structuredClone(receipt);
  changed.expected.before.revision++;
  assert.throws(
    () =>
      validateWorkflowConnectionMaterialRepairReceipt({
        ...input,
        receipt: changed,
      }),
    /different session, revision or replacement source/,
  );
  assert.equal(chat.calls.length, 1);
});

test('invalid/stale input fails before calling a model and concurrent source changes reject the original output', async () => {
  const stale = fixture();
  stale.expected.revision++;
  const chat = model(revisionOutput(stale));
  await assert.rejects(
    planWorkflowConnectionRevision({ ...stale, model: chat }),
  );
  assert.equal(chat.calls.length, 0);
  const input = fixture();
  const output = revisionOutput(input);
  const changing = model(output, () => {
    input.before.session.rootNodeIds = ['summary'];
  });
  await assert.rejects(
    planWorkflowConnectionRevision({ ...input, model: changing }),
    (error) => error.output.decision.kind === 'revise-connections',
  );
  assert.equal(changing.calls.length, 1);
});

test('transport failures and cancellation preserve causes and never invoke another planning mode', async () => {
  const input = fixture();
  const cause = new Error('private provider failure');
  const chat = model(cause);
  await assert.rejects(
    planWorkflowConnectionRevision({ ...input, model: chat }),
    (error) => error.cause === cause,
  );
  assert.equal(chat.calls.length, 1);
  const cancelled = model(revisionOutput(input));
  await assert.rejects(
    planWorkflowConnectionRevision({
      ...input,
      model: cancelled,
      signal: globalThis.AbortSignal.abort(cause),
    }),
    (error) => error.cause === cause,
  );
  assert.equal(cancelled.calls.length, 0);
});

test('actual ChatOpenAI wire schema is standard-valid and excludes code-owned revision/source/impact fields', async () => {
  const input = fixture();
  const output = revisionOutput(input);
  const require = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  let calls = 0;
  const chat = new ChatOpenAI({
    apiKey: 'local-fixture-not-a-credential',
    model: 'gpt-4o',
    maxRetries: 0,
    configuration: {
      baseURL: 'http://127.0.0.1:1/v1',
      fetch: async (_url, options) => {
        calls++;
        const body = JSON.parse(options.body);
        const wire = body.tools[0].function;
        const ajv = new Ajv2020({ strict: false });
        assert.equal(
          ajv.validateSchema(wire.parameters),
          true,
          JSON.stringify(ajv.errors),
        );
        assert.equal(ajv.compile(wire.parameters)(output), true);
        assert.equal(
          JSON.stringify(wire.parameters).includes('sourceFingerprint'),
          false,
        );
        assert.equal(
          JSON.stringify(wire.parameters).includes('affectedNodeIds'),
          false,
        );
        return new globalThis.Response(
          JSON.stringify({
            id: 'revision-wire',
            object: 'chat.completion',
            created: 1,
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'repair',
                      type: 'function',
                      function: {
                        name: wire.name,
                        arguments: JSON.stringify(output),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  });
  assert.equal(
    (await planWorkflowConnectionRevision({ ...input, model: chat })).kind,
    'revised-connections',
  );
  assert.equal(calls, 1);
});

test('a real parent LangGraph checkpoints a revised candidate before connection resumption and preserves old state', async () => {
  const input = fixture();
  let publications = 0;
  const observerFailure = new Error('public observer unavailable');
  const chat = model(revisionOutput(input));
  const state = new StateSchema({
    receipt: z.custom().optional(),
    plan: z.custom().optional(),
  });
  const graph = new StateGraph(state)
    .addNode('reconsider', async () => ({
      receipt: await planWorkflowConnectionRevision({ ...input, model: chat }),
    }))
    .addNode('publish', () => {
      if (++publications === 1) throw observerFailure;
      return {};
    })
    .addNode('continueConnections', (current) => {
      assert.equal(current.receipt.kind, 'revised-connections');
      return {
        plan: finalizeWorkflowConnectionSession({
          ...input.after,
          session: current.receipt.revision.session,
        }),
      };
    })
    .addEdge(START, 'reconsider')
    .addEdge('reconsider', 'publish')
    .addEdge('publish', 'continueConnections')
    .addEdge('continueConnections', END)
    .compile({ checkpointer: new MemorySaver() });
  const config = { configurable: { thread_id: 'repair-checkpoint' } };
  await assert.rejects(
    graph.invoke({}, config),
    (error) => error === observerFailure,
  );
  const snapshot = await graph.getState(config);
  assert.deepEqual(snapshot.next, ['publish']);
  assert.equal(snapshot.values.receipt.kind, 'revised-connections');
  const result = await graph.invoke(null, config);
  assert.deepEqual(result.plan.edges, input.before.session.edges);
  assert.equal(chat.calls.length, 1);
  assert.equal(input.before.session.id, input.expected.sessionId);
});

test('same-type target swaps expose actual before/after mappings and the original target/source schemas to the model', async () => {
  const responses = {
    200: {
      description: 'Original fields',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { alpha: { type: 'string' }, beta: { type: 'string' } },
            required: ['alpha', 'beta'],
          },
        },
      },
    },
  };
  const spec = {
    openapi: '3.1.0',
    info: { title: 'Mapping review fixture', version: '1' },
    paths: {
      '/seed': { get: { responses } },
      '/consume': {
        get: {
          parameters: ['left', 'right'].map((name) => ({
            name,
            in: 'query',
            required: true,
            schema: { type: 'string' },
          })),
          responses,
        },
      },
    },
  };
  const catalog = await createApiCatalog([{ id: 'mapping-fixture', spec }]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((operation) => operation.key),
  );
  const materials = operations.map((operation) => ({
    status: 'ready',
    operation,
    arguments: {
      callId: operation.path === '/seed' ? 'seed' : 'target',
      values: {},
      unresolvedInputs: [],
      bindings:
        operation.path === '/seed'
          ? []
          : [
              {
                kind: 'node-output',
                sourceNodeId: 'seed',
                sourcePointer: '/alpha',
                targetPointer: '/query/left',
              },
              {
                kind: 'node-output',
                sourceNodeId: 'seed',
                sourcePointer: '/beta',
                targetPointer: '/query/right',
              },
            ],
    },
  }));
  const scenario = 'Copy alpha into left and beta into right.';
  const source = {
    scenario,
    materials,
    requirements: [
      {
        id: 'intent',
        text: scenario,
        sources: [{ kind: 'message', messageId: 'request', quote: scenario }],
      },
    ],
    edges: [],
  };
  const goals = [
    {
      kind: 'precedence',
      before: 'seed',
      after: 'target',
      factIds: ['intent'],
      reason: scenario,
    },
  ];
  const first = createWorkflowConnectionSession({ ...source, goals });
  const applied = applyWorkflowConnectionStep({
    ...source,
    session: first,
    expected: describeWorkflowConnectionStep({ ...source, session: first })
      .expected,
    proposal: incrementalConnectionPatch({
      addEdges: [{ from: 'seed', output: 'main', to: 'target', input: 'main' }],
      addRootNodeIds: ['seed'],
      addTerminals: [{ nodeId: 'target', output: 'main' }],
    }),
  });
  assert.equal(applied.status, 'accepted');
  const before = { ...source, session: applied.session };
  const changed = globalThis.structuredClone(materials);
  const consumer = changed.find(
    (material) => material.arguments.callId === 'target',
  );
  [
    consumer.arguments.bindings[0].targetPointer,
    consumer.arguments.bindings[1].targetPointer,
  ] = [
    consumer.arguments.bindings[1].targetPointer,
    consumer.arguments.bindings[0].targetPointer,
  ];
  const after = { ...source, materials: changed };
  const chat = model(
    {
      decision: {
        kind: 'replan-materials',
        targets: [{ stage: 'api-bindings', nodeId: 'target' }],
        factIds: ['intent'],
        reason:
          'The same-type targets are swapped against the explicit user mapping.',
      },
    },
    ({ payload }) => {
      assert.deepEqual(
        payload.before.context.nodes,
        payload.after.context.nodes,
        'node-level producer references alone cannot reveal this target swap',
      );
      const change = payload.materialChanges.apiCalls[0];
      assert.equal(change.before.bindings[0].targetPointer, '/query/left');
      assert.equal(change.after.bindings[0].targetPointer, '/query/right');
      assert.equal(
        change.afterRequestSchema.properties.query.properties.left.type,
        'string',
      );
      assert.equal(
        change.afterRequestSchema.properties.query.properties.right.type,
        'string',
      );
      assert.ok(
        payload.materialChanges.apiResponseContracts.some(
          (contract) =>
            contract.nodeId === 'seed' &&
            contract.responses['200'].content['application/json'].schema
              .properties.alpha.type === 'string',
        ),
      );
    },
  );
  const result = await planWorkflowConnectionRevision({
    before,
    after,
    expected: describeWorkflowConnectionStep(before).expected,
    model: chat,
  });
  assert.equal(result.kind, 'replan-materials');
  assert.equal(chat.calls.length, 1);
});

test('native producer output changes expose unchanged affected API consumer mappings, not only the changed producer', async () => {
  const catalog = await createApiCatalog([
    {
      id: 'native-consumer',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Native contract review', version: '1' },
        paths: {
          '/consume': {
            get: {
              parameters: [
                {
                  name: 'id',
                  in: 'query',
                  required: true,
                  schema: { type: 'string', description: 'Member identifier' },
                },
              ],
              responses: { 200: { description: 'Result' } },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const capability = {
    name: 'review-producer',
    description: 'Explicit producer contract',
    parametersSchema: z.strictObject({}),
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    outputSchema: () => ({
      type: 'object',
      properties: { id: { type: 'string', description: 'Member identifier' } },
    }),
  };
  const scenario = 'Use the original member identifier for the API input.';
  const source = {
    scenario,
    requirements: [
      {
        id: 'intent',
        text: scenario,
        sources: [{ kind: 'message', messageId: 'request', quote: scenario }],
      },
    ],
    materials: [
      {
        status: 'ready',
        operation,
        arguments: {
          callId: 'consumer',
          values: {},
          bindings: [
            {
              kind: 'node-output',
              sourceNodeId: 'producer',
              sourcePointer: '/id',
              targetPointer: '/query/id',
            },
          ],
          unresolvedInputs: [],
        },
      },
    ],
    capabilities: [capability],
    nativeNodes: [
      { id: 'producer', capability: capability.name, parameters: {} },
    ],
    edges: [],
  };
  const goals = [
    {
      kind: 'precedence',
      before: 'producer',
      after: 'consumer',
      factIds: ['intent'],
      reason: scenario,
    },
  ];
  const first = createWorkflowConnectionSession({ ...source, goals });
  const applied = applyWorkflowConnectionStep({
    ...source,
    session: first,
    expected: describeWorkflowConnectionStep({ ...source, session: first })
      .expected,
    proposal: incrementalConnectionPatch({
      addEdges: [
        { from: 'producer', output: 'main', to: 'consumer', input: 'main' },
      ],
      addRootNodeIds: ['producer'],
      addTerminals: [{ nodeId: 'consumer', output: 'main' }],
    }),
  });
  assert.equal(applied.status, 'accepted');
  const before = { ...source, session: applied.session };
  const after = {
    ...source,
    capabilities: [
      {
        ...capability,
        outputSchema: () => ({
          type: 'object',
          properties: { id: { type: 'string', description: 'Email address' } },
        }),
      },
    ],
  };
  const chat = model(
    {
      decision: {
        kind: 'replan-materials',
        targets: [{ stage: 'api-bindings', nodeId: 'consumer' }],
        factIds: ['intent'],
        reason:
          'Same type does not establish the required member-identifier meaning.',
      },
    },
    ({ payload }) => {
      const mapping = payload.materialChanges.apiCalls.find(
        (item) => item.callId === 'consumer',
      );
      assert.ok(mapping);
      assert.equal(mapping.argumentsChanged, false);
      assert.equal(mapping.after.bindings[0].targetPointer, '/query/id');
      assert.equal(
        mapping.afterRequestSchema.properties.query.properties.id.description,
        'Member identifier',
      );
      const producer = payload.materialChanges.nativeNodes.find(
        (item) => item.nodeId === 'producer',
      );
      assert.equal(
        producer.beforeOutput.schema.properties.id.description,
        'Member identifier',
      );
      assert.equal(
        producer.afterOutput.schema.properties.id.description,
        'Email address',
      );
    },
  );
  const result = await planWorkflowConnectionRevision({
    before,
    after,
    expected: describeWorkflowConnectionStep(before).expected,
    model: chat,
  });
  assert.equal(result.kind, 'replan-materials');
});
