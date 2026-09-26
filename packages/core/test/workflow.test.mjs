import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  compileSequence,
  compileWorkflow,
  generateWorkflow,
  operationsFromSpec,
  validateOpenApi,
} from '@openapi-flow/core';

const spec = {
  openapi: '3.0.4',
  info: { title: 'Example', version: '1' },
  paths: {
    '/items/{id}': {
      get: {
        operationId: 'getItem',
        summary: 'Read one item',
        'x-openapi-flow-effect': 'read',
        parameters: [{ $ref: '#/components/parameters/ItemId' }],
        responses: {
          200: {
            description: 'Item response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Item' },
              },
            },
          },
        },
      },
    },
    '/items': {
      post: {
        operationId: 'createItem',
        summary: 'Create an item',
        'x-openapi-flow-effect': 'write',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NewItem' },
            },
          },
        },
        responses: {
          201: {
            description: 'Created item',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Item' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    parameters: {
      ItemId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
    },
    schemas: {
      Item: {
        type: 'object',
        properties: { id: { type: 'string' }, ok: { type: 'boolean' } },
      },
      NewItem: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      },
    },
  },
};

function plan(operationRef, inputs, expectedBody) {
  return {
    version: '1',
    goal: 'Check an item',
    operationRef,
    inputs,
    expectedBody,
  };
}

test('GET with a local $ref compiles to an SDK-validated workflow', async () => {
  const request = {
    spec,
    baseUrl: 'https://example.test',
    profile: 'read-only',
    plan: plan('getItem', { 'path.id': 'a b' }, { ok: true }),
  };
  const result = await compileWorkflow(request);
  assert.deepEqual(result.workflow, (await compileWorkflow(request)).workflow);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.evidence, {
    operationRef: '#/paths/~1items~1{id}/get',
    operationId: 'getItem',
    method: 'GET',
    path: '/items/{id}',
    status: 200,
    effect: 'read',
  });
  assert.deepEqual(
    result.workflow.nodes.map((node) => node.name),
    ['Start', 'GET /items/{id}', 'Assert response'],
  );
  assert.equal(
    result.workflow.nodes[1].parameters.url,
    'https://example.test/items/a%20b',
  );
  assert.equal(
    result.workflow.nodes[1].parameters.options.response.response.fullResponse,
    true,
  );
  assert.equal(
    result.workflow.connections.Start.main[0][0].node,
    'GET /items/{id}',
  );
  const code = result.workflow.nodes[2].parameters.jsCode;
  assert.deepEqual(
    runInNewContext('(function() { ' + code + ' })()', {
      $input: {
        all: () => [
          {
            json: {
              statusCode: 200,
              body: { ok: true },
            },
          },
        ],
      },
    }).map((item) => item.json.body.ok),
    [true],
  );
  assert.throws(
    () =>
      runInNewContext('(function() { ' + code + ' })()', {
        $input: {
          all: () => [
            {
              json: {
                statusCode: 200,
                body: { ok: false },
              },
            },
          ],
        },
      }),
    /Unexpected response body field: ok/,
  );
});

test('required input and policy block cannot yield a workflow', async () => {
  const missing = await compileWorkflow({
    spec,
    baseUrl: 'https://example.test',
    profile: 'read-only',
    plan: plan('getItem', {}),
  });
  assert.equal(missing.status, 'needs_input');
  assert.deepEqual(missing.missingInputs, ['path.id']);
  assert.equal(missing.workflow, undefined);
  const blocked = await compileWorkflow({
    spec,
    baseUrl: 'https://example.test',
    profile: 'read-only',
    plan: plan('createItem', { body: { name: 'demo' } }),
  });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.workflow, undefined);
  const unknown = globalThis.structuredClone(spec);
  delete unknown.paths['/items/{id}'].get['x-openapi-flow-effect'];
  assert.equal(
    (
      await compileWorkflow({
        spec: unknown,
        baseUrl: 'https://example.test',
        profile: 'test',
        plan: plan('getItem', { 'path.id': 'x' }),
      })
    ).status,
    'blocked',
  );
});

test('POST JSON body is checked against required schema fields', async () => {
  const missing = await compileWorkflow({
    spec,
    baseUrl: 'https://example.test',
    profile: 'test',
    plan: plan('createItem', { body: {} }),
  });
  assert.equal(missing.status, 'needs_input');
  assert.deepEqual(missing.missingInputs, ['body.name']);
  const result = await compileWorkflow({
    spec,
    baseUrl: 'https://example.test',
    profile: 'test',
    plan: plan('createItem', { body: { name: 'demo' } }, { ok: true }),
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.workflow.nodes[1].parameters.method, 'POST');
  assert.equal(result.workflow.nodes[1].parameters.jsonBody, '{"name":"demo"}');
  await assert.rejects(
    () =>
      compileWorkflow({
        spec,
        baseUrl: 'https://example.test',
        profile: 'test',
        plan: plan('createItem', { body: { name: 12 } }),
      }),
    /body.name must be string/,
  );
});

test('OAS primitive types and enum values constrain supplied inputs and assertions', async () => {
  const constrained = globalThis.structuredClone(spec);
  constrained.components.parameters.ItemId.schema.enum = ['allowed'];
  await assert.rejects(
    () =>
      compileWorkflow({
        spec: constrained,
        baseUrl: 'https://example.test',
        profile: 'read-only',
        plan: plan('getItem', { 'path.id': 'other' }),
      }),
    /outside the OAS enum/,
  );
  await assert.rejects(
    () =>
      compileWorkflow({
        spec,
        baseUrl: 'https://example.test',
        profile: 'read-only',
        plan: plan('getItem', { 'path.id': 'allowed' }, { ok: 'yes' }),
      }),
    /plan.expectedBody.ok must be boolean/,
  );
  const password = globalThis.structuredClone(spec);
  password.components.schemas.NewItem.properties.password = { type: 'string' };
  await assert.rejects(
    () =>
      compileWorkflow({
        spec: password,
        baseUrl: 'https://example.test',
        profile: 'test',
        plan: plan('createItem', {
          body: { name: 'demo', password: 'hidden' },
        }),
      }),
    /looks like a credential/,
  );
});

test('untrusted or unsupported contract data fails before workflow generation', async () => {
  assert.equal(validateOpenApi({ ...spec, openapi: '3.1.0' }).openapi, '3.1.0');
  assert.equal(
    (await operationsFromSpec({ ...spec, openapi: '3.1.0' })).length,
    2,
  );
  await assert.rejects(
    () =>
      compileWorkflow({
        spec,
        baseUrl: 'https://example.test/path',
        profile: 'test',
        plan: plan('getItem', { 'path.id': 'x' }),
      }),
    /baseUrl/,
  );
  const external = globalThis.structuredClone(spec);
  external.paths['/items/{id}'].get.parameters[0].$ref =
    'https://example.test/parameter.json';
  await assert.rejects(
    () =>
      compileWorkflow({
        spec: external,
        baseUrl: 'https://example.test',
        profile: 'test',
        plan: plan('getItem', { 'path.id': 'x' }),
      }),
    /Can't resolve external reference/,
  );
  const secure = globalThis.structuredClone(spec);
  secure.components.securitySchemes = {
    bearerAuth: { type: 'http', scheme: 'bearer' },
  };
  secure.security = [{ bearerAuth: [] }];
  await assert.rejects(
    () =>
      compileWorkflow({
        spec: secure,
        baseUrl: 'https://example.test',
        profile: 'test',
        plan: plan('getItem', { 'path.id': 'x' }),
      }),
    /requires credentials/,
  );
  const duplicate = globalThis.structuredClone(spec);
  duplicate.paths['/another/{id}'] = globalThis.structuredClone(
    duplicate.paths['/items/{id}'],
  );
  await assert.rejects(
    () => operationsFromSpec(duplicate),
    /duplicate operationId/,
  );
  await assert.rejects(
    () =>
      compileWorkflow({
        spec,
        baseUrl: 'https://example.test',
        profile: 'test',
        plan: plan('unknown', {}),
      }),
    /not in spec.paths/,
  );
});

test('unrelated unsupported operations do not prevent selection of a supported operation', async () => {
  const mixed = globalThis.structuredClone(spec);
  mixed.components.securitySchemes = {
    bearerAuth: { type: 'http', scheme: 'bearer' },
  };
  mixed.paths['/items'].post.security = [{ bearerAuth: [] }];
  const result = await compileWorkflow({
    spec: mixed,
    baseUrl: 'https://example.test',
    profile: 'read-only',
    plan: plan('getItem', { 'path.id': 'x' }),
  });
  assert.equal(result.status, 'complete');
  await assert.rejects(
    () =>
      compileWorkflow({
        spec: mixed,
        baseUrl: 'https://example.test',
        profile: 'test',
        plan: plan('createItem', { body: { name: 'demo' } }),
      }),
    /requires credentials/,
  );
});

test('OAS validation rejects malformed responses before operation selection', async () => {
  const malformed = globalThis.structuredClone(spec);
  delete malformed.paths['/items/{id}'].get.responses[200].description;
  await assert.rejects(
    () => operationsFromSpec(malformed),
    /spec OpenAPI validation failed:.*description/,
  );
  const unrelated = globalThis.structuredClone(spec);
  delete unrelated.paths['/items'].post.responses[201].description;
  await assert.rejects(
    () =>
      compileWorkflow({
        spec: unrelated,
        baseUrl: 'https://example.test',
        profile: 'read-only',
        plan: plan('getItem', { 'path.id': 'x' }),
      }),
    /spec OpenAPI validation failed:.*description/,
  );
});

test('document acceptance follows OAS instead of prototype size, version, and id limits', async () => {
  const withoutId = globalThis.structuredClone(spec);
  delete withoutId.paths['/items/{id}'].get.operationId;
  delete withoutId.paths['/items'].post.operationId;
  const candidates = await operationsFromSpec(withoutId);
  assert.deepEqual(
    candidates.map(({ operationRef }) => operationRef),
    ['#/paths/~1items~1{id}/get', '#/paths/~1items/post'],
  );
  const result = await compileWorkflow({
    spec: withoutId,
    baseUrl: 'https://example.test',
    profile: 'read-only',
    plan: plan('#/paths/~1items~1{id}/get', { 'path.id': 'x' }),
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.evidence.operationId, undefined);
  assert.equal(result.evidence.operationRef, '#/paths/~1items~1{id}/get');

  const recent = {
    openapi: '3.2.0',
    info: { title: 'Large', version: '1', description: 'x'.repeat(2_100_000) },
    paths: {
      '/items': {
        query: { responses: { 200: { description: 'ok' } } },
        additionalOperations: {
          PURGE: { responses: { 200: { description: 'ok' } } },
        },
      },
    },
  };
  assert.equal(validateOpenApi(recent).openapi, '3.2.0');
  assert.deepEqual(
    (await operationsFromSpec(recent)).map(({ method }) => method),
    ['QUERY', 'PURGE'],
  );
  assert.throws(
    () =>
      validateOpenApi({
        openapi: '3.0.4',
        info: { title: 'Invalid' },
        paths: {},
      }),
    /version/,
  );
});

test('external references are valid OAS but require supplied resolution before compilation', async () => {
  const external = globalThis.structuredClone(spec);
  external.components.schemas.Unused = {
    $ref: 'https://example.test/unused.json',
  };
  assert.equal(validateOpenApi(external).openapi, '3.0.4');
  await assert.rejects(
    () => operationsFromSpec(external),
    /Can't resolve external reference/,
  );
});

test('catalogue accepts DELETE while compilation keeps write safety', async () => {
  const withDelete = globalThis.structuredClone(spec);
  withDelete.paths['/items/{id}'].delete = {
    'x-openapi-flow-effect': 'read',
    parameters: [{ $ref: '#/components/parameters/ItemId' }],
    responses: { 204: { description: 'Deleted' } },
  };
  const ref = '#/paths/~1items~1{id}/delete';
  assert.ok(
    (await operationsFromSpec(withDelete)).some(
      (item) => item.operationRef === ref,
    ),
  );
  const result = await compileWorkflow({
    spec: withDelete,
    baseUrl: 'https://example.test',
    profile: 'read-only',
    plan: plan(ref, { 'path.id': 'x' }),
  });
  assert.equal(result.status, 'blocked');
});

test('operation parameters override path-level parameters with the same name', async () => {
  const overridden = globalThis.structuredClone(spec);
  overridden.paths['/items/{id}'].parameters = [
    {
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'integer' },
    },
  ];
  const result = await compileWorkflow({
    spec: overridden,
    baseUrl: 'https://example.test',
    profile: 'read-only',
    plan: plan('getItem', { 'path.id': 'text-id' }),
  });
  assert.equal(result.status, 'complete');
  assert.equal(
    result.workflow.nodes[1].parameters.url,
    'https://example.test/items/text-id',
  );
});

test('external references are rejected even outside the selected operation', async () => {
  const external = globalThis.structuredClone(spec);
  external.components.schemas.Unused = {
    $ref: 'https://example.test/unused.json',
  };
  await assert.rejects(
    () =>
      compileWorkflow({
        spec: external,
        baseUrl: 'https://example.test',
        profile: 'read-only',
        plan: plan('getItem', { 'path.id': 'x' }),
      }),
    /Can't resolve external reference/,
  );
});

test('a recursive selected schema cannot bypass the simple-schema policy', async () => {
  const recursive = globalThis.structuredClone(spec);
  recursive.components.schemas.Item.properties.next = {
    $ref: '#/components/schemas/Item',
  };
  await assert.rejects(
    () =>
      compileWorkflow({
        spec: recursive,
        baseUrl: 'https://example.test',
        profile: 'read-only',
        plan: plan('getItem', { 'path.id': 'x' }),
      }),
    /must be a primitive schema/,
  );
});

test('a POST response field can bind a later GET path without model-authored code', async () => {
  const sequence = {
    version: '1',
    goal: 'Create and read an item',
    steps: [
      {
        id: 'create',
        operationRef: 'createItem',
        inputs: { body: { name: 'demo' } },
      },
      {
        id: 'read',
        operationRef: 'getItem',
        inputs: {
          'path.id': { fromStep: 'create', field: 'id' },
        },
        expectedBody: { ok: true },
      },
    ],
  };
  const request = {
    spec,
    baseUrl: 'https://example.test',
    profile: 'test',
    plan: sequence,
  };
  const result = await compileSequence(request);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.workflow, (await compileSequence(request)).workflow);
  assert.deepEqual(
    result.workflow.nodes.map((item) => item.name),
    ['Start', 'Request create', 'Assert create', 'Request read', 'Assert read'],
  );
  assert.match(
    result.workflow.nodes[3].parameters.url,
    /\$node\["Request create"\]\.json\.body\["id"\]/,
  );
  const createAssertion = result.workflow.nodes[2].parameters.jsCode;
  assert.throws(
    () =>
      runInNewContext('(function() { ' + createAssertion + ' })()', {
        $input: {
          all: () => [{ json: { statusCode: 201, body: { name: 'demo' } } }],
        },
      }),
    /Missing or invalid response body field: id/,
  );
  assert.equal(
    (await compileSequence({ ...request, profile: 'read-only' })).status,
    'blocked',
  );
  const missing = globalThis.structuredClone(sequence);
  delete missing.steps[0].inputs;
  assert.deepEqual(
    (await compileSequence({ ...request, plan: missing })).missingInputs,
    ['create.body'],
  );
  const bad = globalThis.structuredClone(sequence);
  bad.steps[1].inputs['path.id'].field = 'absent';
  await assert.rejects(
    () => compileSequence({ ...request, plan: bad }),
    /prior response field/,
  );
});

test('LangChain structured output selects an operation and proposes validated bindings', async () => {
  const model = {
    withStructuredOutput(schema, options) {
      if (options.name === 'select_operation') {
        assert.deepEqual(schema.properties.operationRef.enum, [
          '#/paths/~1items~1{id}/get',
          '#/paths/~1items/post',
        ]);
        return {
          async invoke() {
            return { operationRef: '#/paths/~1items~1{id}/get' };
          },
        };
      }
      assert.equal(options.name, 'plan_operation');
      assert.deepEqual(schema.properties.inputs.items.properties.key.enum, [
        'path.id',
      ]);
      return {
        async invoke() {
          return {
            inputs: [{ key: 'path.id', value: 'x' }],
            expectedBody: [{ key: 'ok', value: true }],
          };
        },
      };
    },
  };
  const result = await generateWorkflow({
    spec,
    scenario: 'Read an item',
    model,
    baseUrl: 'https://example.test',
    profile: 'read-only',
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.plan.operationRef, '#/paths/~1items~1{id}/get');
  assert.deepEqual(result.plan.inputs, { 'path.id': 'x' });
  assert.deepEqual(result.plan.expectedBody, { ok: true });
  const invalid = {
    withStructuredOutput: () => ({
      invoke: async () => ({ operationRef: 'madeUp' }),
    }),
  };
  await assert.rejects(
    generateWorkflow({
      spec,
      scenario: 'Read an item',
      model: invalid,
      baseUrl: 'https://example.test',
      profile: 'read-only',
    }),
    /outside spec.paths/,
  );
  const omitted = {
    withStructuredOutput(_schema, options) {
      return {
        invoke: async () =>
          options.name === 'select_operation'
            ? { operationRef: '#/paths/~1items~1{id}/get' }
            : { inputs: [], expectedBody: [] },
      };
    },
  };
  const needsInput = await generateWorkflow({
    spec,
    scenario: 'Read an item',
    model: omitted,
    baseUrl: 'https://example.test',
    profile: 'read-only',
  });
  assert.equal(needsInput.status, 'needs_input');
  assert.deepEqual(needsInput.missingInputs, ['path.id']);

  const mutable = globalThis.structuredClone(spec);
  const mutatingModel = {
    withStructuredOutput(_schema, options) {
      return {
        async invoke() {
          if (options.name === 'select_operation') {
            return { operationRef: '#/paths/~1items~1{id}/get' };
          }
          mutable.components.schemas.Item.properties.ok.type = 'string';
          return {
            inputs: [{ key: 'path.id', value: 'x' }],
            expectedBody: [{ key: 'ok', value: true }],
          };
        },
      };
    },
  };
  const stable = await generateWorkflow({
    spec: mutable,
    scenario: 'Read an item',
    model: mutatingModel,
    baseUrl: 'https://example.test',
    profile: 'read-only',
  });
  assert.equal(stable.status, 'complete');
  assert.deepEqual(stable.plan.expectedBody, { ok: true });
});
