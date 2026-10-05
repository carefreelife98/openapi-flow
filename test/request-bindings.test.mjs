import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { URL, URLSearchParams } from 'node:url';
import {
  validateApiBindingPlan,
  validateApiArguments,
  createApiArgumentsSchema,
  materializeApiArguments,
  createApiCatalog,
  resolveApiOperations,
} from '@openapi-flow/core';
import { planApiBindings, generateApiArguments } from '@openapi-flow/langchain';
import {
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
  createN8nNativeCapabilities,
} from '@openapi-flow/n8n';

import {
  materials,
  bind,
  bindingPlan,
  graphMaterials,
  graphPlan,
  names,
  spec,
} from './fixtures/request-binding-fixture.mjs';
import { assembleN8nWorkflow } from '@openapi-flow/n8n';
function fragment(material) {
  return createHttpRequestNode({
    ...material,
    baseUrl: 'https://fixture.example.test/api',
    credentialBindings: {},
    apiNodeNames: names,
    position: [300, 0],
  });
}
function compile(plan = graphPlan) {
  return compilePlannedN8nWorkflow({
    id: 'bindings',
    name: 'Bindings',
    plan,
    materials: graphMaterials,
    capabilities: createN8nNativeCapabilities(),
    apiNodes: [...graphMaterials].reverse().map(fragment),
  });
}
function execute(callId, responses) {
  const compiled = fragment(
    graphMaterials.find((item) => item.arguments.callId === callId),
  );
  const code = compiled.entry.config.parameters.jsCode;
  return vm.runInNewContext(
    `Object.defineProperty=()=>({});Object.defineProperties=()=>({});Object.getPrototypeOf=()=>({});Reflect.getPrototypeOf=()=>({});(function(){${code}})()`,
    {
      $: (name) => ({
        all: () => [{ json: { body: responses[name.slice(8)] } }],
      }),
    },
  )[0].json;
}

test('binding planning derives typed pointers from multiple OAS contracts with described strict output', async () => {
  const plan = await planApiBindings({
    materials,
    scenario:
      'Use the actual source ID and join three independently dependent APIs into summary',
    model: {
      withStructuredOutput(schema, options) {
        assert.equal(options.name, 'plan_api_bindings');
        assert.equal(options.strict, true);
        return {
          async invoke(messages) {
            const input = JSON.parse(messages[1].content);
            assert.ok(input.materials[0].operation.operation.responses);
            return schema.parse(bindingPlan);
          },
        };
      },
    },
  });
  assert.deepEqual(plan, bindingPlan);
});

test('fully bound requests have no literal values for the model to decide', async () => {
  const detail = graphMaterials.find(
    (item) => item.arguments.callId === 'detail',
  );
  const args = await generateApiArguments({
    callId: 'detail',
    operation: detail.operation,
    scenario: 'Use the source response ID',
    bindings: detail.arguments.bindings,
    model: {
      withStructuredOutput() {
        throw new Error('Model must not be called without literal fields');
      },
    },
  });
  assert.deepEqual(args.values, {});
  assert.deepEqual(args.unresolvedInputs, []);
  assert.deepEqual(args.bindings, detail.arguments.bindings);
});
test('binding validation rejects missing identities/fields, overlap, incompatible types, self references and cycles', () => {
  validateApiBindingPlan({ materials, plan: bindingPlan });
  for (const [mutate, error] of [
    [
      (p) => (p.calls[1].bindings[0].sourceNodeId = 'missing'),
      /unknown source/,
    ],
    [
      (p) => (p.calls[1].bindings[0].sourcePointer = '/missing'),
      /response OAS/,
    ],
    [
      (p) => (p.calls[1].bindings[0].targetPointer = '/path/missing'),
      /request OAS/,
    ],
    [(p) => (p.calls[1].bindings[0].sourcePointer = '/labels'), /incompatible/],
    [(p) => p.calls[1].bindings.push({ ...p.calls[1].bindings[0] }), /overlap/],
    [(p) => (p.calls[1].bindings[0].sourceNodeId = 'detail'), /self-reference/],
    [(p) => (p.calls[1].bindings[0].sourceNodeId = 'summary'), /cycle/],
  ]) {
    const copy = globalThis.structuredClone(bindingPlan);
    mutate(copy);
    assert.throws(
      () => validateApiBindingPlan({ materials, plan: copy }),
      error,
    );
  }
});
test('typed literal schemas exclude bound fields and nested missing requirements remain visible', () => {
  const item = graphMaterials.find(
    (entry) => entry.arguments.callId === 'summary',
  );
  assert.deepEqual(
    validateApiArguments({
      operation: item.operation,
      values: {},
      bindings: item.arguments.bindings,
    }).missingInputs,
    [],
  );
  assert.ok(
    createApiArgumentsSchema({
      operation: item.operation,
      bindings: item.arguments.bindings,
    }).safeParse({ values: {} }).success,
  );
  assert.equal(
    createApiArgumentsSchema({
      operation: item.operation,
      bindings: item.arguments.bindings,
    }).safeParse({ values: { body: { id: 'guessed' } } }).success,
    false,
  );
  const nested = [
    bind('/body/filter/R', 'source', '/stock'),
    ...item.arguments.bindings.filter(
      (entry) => entry.targetPointer !== '/body/filter',
    ),
  ];
  assert.deepEqual(
    validateApiArguments({
      operation: item.operation,
      values: {},
      bindings: nested,
    }).missingInputs,
    [],
  );
});
test('runtime materialization preserves scalar/object/array types and reuses OAS query serialization', () => {
  const responses = {
    source: { id: 'runtime/42', labels: ['a b', 'c'], filter: { R: 2 } },
  };
  assert.equal(
    execute('detail', responses).url,
    'https://fixture.example.test/api/detail/runtime%2F42',
  );
  const url = execute('price', responses).url;
  assert.match(url, /id=runtime%2F42/);
  assert.equal(new URL(url).searchParams.get('labels'), 'a b|c');
  assert.equal(new URL(url).searchParams.get('filter[R]'), '2');
  const result = execute('summary', {
    ...responses,
    detail: { id: 'runtime/42' },
    price: { price: 12.5 },
    stock: { stock: 0 },
  });
  assert.deepEqual(JSON.parse(result.body.value), {
    id: 'runtime/42',
    price: 12.5,
    stock: 0,
    labels: ['a b', 'c'],
    filter: { R: 2 },
  });
});
test('runtime rejects missing fields, ambiguous source items and wrong OAS types before HTTP', () => {
  assert.throws(
    () => execute('detail', { source: {} }),
    /Missing response pointer/,
  );
  assert.throws(() => execute('detail', { source: { id: 42 } }), /OAS schema/);
  const code = fragment(graphMaterials[1]).entry.config.parameters.jsCode;
  assert.throws(
    () =>
      vm.runInNewContext(`(function(){${code}})()`, {
        $: () => ({ all: () => [] }),
      }),
    /unambiguous/,
  );
  assert.throws(
    () =>
      createHttpRequestNode({
        ...graphMaterials[1],
        baseUrl: 'https://fixture.test',
        credentialBindings: {},
        position: [0, 0],
      }),
    /apiNodeNames/,
  );
});
test('DAG compiles data producers, independent siblings and explicit join, regardless of array order', () => {
  const result = compile();
  assert.equal(result.workflow.connections['Request source'].main[0].length, 3);
  assert.equal(
    result.workflow.connections.join.main[0][0].node,
    'Materialize summary',
  );
  assert.equal(
    result.workflow.connections['Materialize summary'].main[0][0].node,
    'Request summary',
  );
  const broken = globalThis.structuredClone(graphPlan);
  broken.edges = broken.edges.filter((entry) => entry.to !== 'summary');
  broken.edges.push({
    from: 'detail',
    output: 'main',
    to: 'summary',
    input: 'main',
  });
  assert.throws(() => compile(broken), /response price is not available/);
});
test('whole response bodies and escaped pointers materialize without literal fallback', () => {
  assert.deepEqual(
    materializeApiArguments(
      {},
      [bind('/body', 'source', '')],
      {
        source: { id: 'new' },
      },
      materials.find((item) => item.callId === 'summary'),
    ),
    { body: { id: 'new' } },
  );
  assert.deepEqual(
    materializeApiArguments(
      {},
      [bind('/query/a~1b', 'source', '/x~0y/0')],
      {
        source: { 'x~y': ['actual'] },
      },
      materials.find((item) => item.callId === 'price'),
    ),
    { query: { 'a/b': 'actual' } },
  );
  assert.throws(
    () =>
      materializeApiArguments(
        { path: { id: 'literal' } },
        [bind('/path/id', 'source', '/id')],
        { source: { id: 'actual' } },
        materials.find((item) => item.callId === 'detail'),
      ),
    /conflicts/,
  );
});

test('OAS determines numeric object keys versus array items and keeps unconstrained fields open', async () => {
  const document = globalThis.structuredClone(spec);
  const body =
    document.paths['/summary'].post.requestBody.content['application/json'];
  body.schema = {
    type: 'object',
    required: ['0', 'entries'],
    properties: {
      0: { type: 'string' },
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
  };
  const catalog = await createApiCatalog([{ id: 'numeric', spec: document }]);
  const operation = (
    await resolveApiOperations(catalog, [
      catalog.operations.find((item) => item.path === '/summary').key,
    ])
  )[0];
  const material = { callId: 'summary', operation };
  const bindings = [
    bind('/body/0', 'source', '/id'),
    bind('/body/entries/0/id', 'source', '/id'),
  ];
  assert.deepEqual(
    materializeApiArguments(
      {},
      bindings,
      { source: { id: 'actual' } },
      material,
    ),
    { body: { 0: 'actual', entries: [{ id: 'actual' }] } },
  );
  validateApiBindingPlan({
    materials: [materials[0], material],
    plan: {
      gaps: [],
      calls: [
        { callId: 'source', bindings: [] },
        {
          callId: 'summary',
          bindings: [bind('/body/undeclared', 'source', '/id')],
        },
      ],
    },
  });
});

test('multi-node fragments reject missing, invalid and cyclic internal connections', () => {
  const compiled = fragment(graphMaterials[1]);
  for (const edges of [
    [],
    [{ from: compiled.entry.id, to: 'missing', output: 0, input: 0 }],
    [
      ...compiled.internalEdges,
      { from: compiled.exit.id, to: compiled.entry.id, output: 0, input: 0 },
    ],
  ])
    assert.throws(
      () =>
        assembleN8nWorkflow({
          id: 'broken',
          name: 'Broken',
          nodes: [{ ...compiled, internalEdges: edges }],
          edges: [],
          starts: ['detail'],
        }),
      /internal/,
    );
});

test('bound form, headers and cookies use shared serialization inside a VM without browser globals', async () => {
  const document = {
    openapi: '3.1.0',
    info: { title: 'Bound form', version: '1' },
    paths: {
      '/form': {
        post: {
          parameters: [
            {
              name: 'X-Label',
              in: 'header',
              schema: { type: 'string' },
              required: true,
            },
            {
              name: 'label',
              in: 'cookie',
              schema: { type: 'string' },
              required: true,
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string' } },
                  required: ['name'],
                },
              },
            },
          },
          responses: { 200: { description: 'OK' } },
        },
      },
    },
  };
  const catalog = await createApiCatalog([{ id: 'form', spec: document }]);
  const operation = (
    await resolveApiOperations(
      catalog,
      catalog.operations.map((item) => item.key),
    )
  )[0];
  const f = createHttpRequestNode({
    operation,
    arguments: {
      callId: 'form',
      values: {},
      bindings: [
        bind('/body/name', 'source', '/name'),
        bind('/header/X-Label', 'source', '/header'),
        bind('/cookie/label', 'source', '/cookie'),
      ],
      unresolvedInputs: [],
    },
    baseUrl: 'https://fixture.test',
    credentialBindings: {},
    apiNodeNames: { source: 'Source' },
    position: [0, 0],
  });
  for (const name of ['a b', "!'()~*+한글", '\uD800']) {
    const r = vm.runInNewContext(
      `(function(){${f.entry.config.parameters.jsCode}})()`,
      {
        $: () => ({
          all: () => [
            {
              json: { body: { name, header: 'actual-header', cookie: 'a b' } },
            },
          ],
        }),
      },
    )[0].json;
    assert.equal(r.body.value, new URLSearchParams({ name }).toString());
    assert.equal(JSON.parse(r.headersJson)['X-Label'], 'actual-header');
    assert.equal(JSON.parse(r.headersJson).Cookie, 'label=a%20b');
  }
  assert.match(f.entry.config.parameters.jsCode, /Evgeny Poberezkin/);
});
