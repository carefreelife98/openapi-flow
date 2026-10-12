import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiOperations,
  listApiResponsePointers,
  validateApiBindingAssignments,
  materializeApiArguments,
} from '@openapi-flow/core';
import { planApiBindings } from '@openapi-flow/langchain';
import { materials } from './fixtures/request-binding-fixture.mjs';

async function operation(schema, openapi = '3.1.0') {
  const catalog = await createApiCatalog([
    {
      id: 'pointer-fixture',
      spec: {
        openapi,
        info: { title: 'Pointer fixture', version: '1' },
        paths: {
          '/result': {
            get: {
              responses: {
                200: {
                  description: 'Result',
                  content: { 'application/json': { schema } },
                },
              },
            },
          },
        },
      },
    },
  ]);
  return (await resolveApiOperations(catalog, [catalog.operations[0].key]))[0];
}

test('response pointers come from exact body declarations with types, descriptions and escaping', async () => {
  const source = await operation({
    type: 'object',
    properties: {
      result: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Identifier from the response' },
          cached: { type: 'boolean' },
          'a/b~c': { type: ['integer', 'null'] },
        },
      },
    },
  });
  const before = globalThis.structuredClone(source);
  const [catalog] = listApiResponsePointers(source);
  assert.equal(catalog.responseKey, '200');
  assert.equal(catalog.mediaType, 'application/json');
  assert.deepEqual(
    catalog.declaredPointers.map((x) => x.pointer),
    ['', '/result', '/result/id', '/result/cached', '/result/a~1b~0c'],
  );
  assert.deepEqual(
    catalog.declaredPointers.find((x) => x.pointer === '/result/id'),
    {
      pointer: '/result/id',
      schemaLocation: '/properties/result/properties/id',
      type: 'string',
      description: 'Identifier from the response',
    },
  );
  assert.deepEqual(catalog.declaredPointers.at(-1).type, ['integer', 'null']);
  assert.ok(
    !catalog.declaredPointers.some((x) =>
      x.pointer.includes('/result/result/'),
    ),
  );
  assert.deepEqual(source, before);
});

test('composition and conditional declarations keep their schema locations without traversing example data', async () => {
  const source = await operation({
    type: 'object',
    allOf: [{ properties: { shared: { type: 'string' } } }],
    anyOf: [
      { properties: { choice: { type: 'string' } } },
      { properties: { choice: { type: 'number' } } },
    ],
    oneOf: [
      { properties: { left: { type: 'boolean' } } },
      { properties: { right: { type: 'boolean' } } },
    ],
    if: { properties: { kind: { const: 'detailed' } } },
    then: { properties: { detailed: { type: 'string' } } },
    else: { properties: { brief: { type: 'string' } } },
    dependentSchemas: {
      trigger: { properties: { dependent: { type: 'integer' } } },
    },
    not: { properties: { forbiddenHint: {} } },
    example: { inventedExampleKey: { properties: { leaked: {} } } },
    default: { inventedDefaultKey: 'not a schema' },
  });
  const [catalog] = listApiResponsePointers(source);
  const fields = catalog.declaredPointers;
  assert.equal(fields.filter((x) => x.pointer === '/choice').length, 2);
  for (const name of [
    'shared',
    'left',
    'right',
    'detailed',
    'brief',
    'dependent',
  ])
    assert.ok(
      fields.some((x) => x.pointer === '/' + name),
      name,
    );
  assert.ok(
    fields.some((x) => x.schemaLocation === '/anyOf/1/properties/choice'),
  );
  for (const name of [
    'kind',
    'forbiddenHint',
    'inventedExampleKey',
    'inventedDefaultKey',
    'leaked',
  ])
    assert.ok(!fields.some((x) => x.pointer === '/' + name), name);
});

test('dynamic dictionaries and homogeneous arrays never receive guessed keys or zero indices', async () => {
  const source = await operation({
    type: 'object',
    additionalProperties: false,
    properties: {
      dictionary: { type: 'object', additionalProperties: { type: 'string' } },
      patterned: {
        type: 'object',
        additionalProperties: false,
        patternProperties: {
          '^x/': { type: 'number' },
          '^forbidden': false,
        },
      },
      list: {
        type: 'array',
        items: { type: 'object', properties: { id: { type: 'string' } } },
      },
      tuple: {
        type: 'array',
        prefixItems: [{ type: 'string' }, { type: 'integer' }],
        items: false,
      },
      denied: false,
      free: true,
    },
  });
  const [catalog] = listApiResponsePointers(source);
  const paths = catalog.declaredPointers.map((x) => x.pointer);
  assert.ok(paths.includes('/tuple/0') && paths.includes('/tuple/1'));
  assert.ok(!paths.includes('/list/0') && !paths.includes('/list/0/id'));
  assert.ok(!paths.includes('/dictionary/id') && !paths.includes('/denied'));
  assert.ok(
    catalog.dynamicLocations.some(
      (x) => x.pointer === '/list' && x.kind === 'array-items',
    ),
  );
  assert.ok(
    catalog.dynamicLocations.some(
      (x) => x.pointer === '/dictionary' && x.kind === 'additional-properties',
    ),
  );
  assert.deepEqual(
    catalog.dynamicLocations
      .filter((x) => x.kind === 'pattern-properties')
      .map((x) => x.constraint),
    ['^x/'],
  );
  assert.ok(
    catalog.dynamicLocations.some(
      (x) => x.pointer === '/free' && x.kind === 'unconstrained',
    ),
  );
});

test('OAS 3.0 nullable declarations describe null without changing the original contract', async () => {
  const source = await operation({ type: 'string', nullable: true }, '3.0.3');
  const before = globalThis.structuredClone(source);
  assert.deepEqual(
    listApiResponsePointers(source)[0].declaredPointers[0].type,
    ['string', 'null'],
  );
  assert.deepEqual(source, before);
});

test('response variants retain original keys/media and a false schema yields no value candidates', async () => {
  const source = await operation(false);
  source.operation.responses['4XX'] = {
    description: 'Error',
    content: { 'text/plain': { schema: { type: 'string' } } },
  };
  source.operation.responses.default = { description: 'No body' };
  const catalogs = listApiResponsePointers(source);
  assert.deepEqual(
    catalogs.map((x) => [x.responseKey, x.mediaType]),
    [
      ['200', 'application/json'],
      ['4XX', 'text/plain'],
    ],
  );
  assert.deepEqual(catalogs[0].declaredPointers, []);
  assert.deepEqual(catalogs[0].dynamicLocations, []);
  assert.deepEqual(catalogs[1].declaredPointers, [
    { pointer: '', schemaLocation: '', type: 'string' },
  ]);
});

test('unexpanded references and cyclic resolved graphs are explicit boundaries, not depth-limited paths', async () => {
  const source = await operation({ type: 'object' });
  const schema = {
    type: 'object',
    properties: {
      referenced: { $ref: '#/$defs/Node' },
      dynamic: { $dynamicRef: '#node' },
    },
  };
  schema.properties.child = schema;
  source.operation.responses['200'].content['application/json'].schema = schema;
  const [catalog] = listApiResponsePointers(source);
  assert.ok(
    catalog.dynamicLocations.some(
      (x) => x.pointer === '/referenced' && x.constraint === '#/$defs/Node',
    ),
  );
  assert.ok(
    catalog.dynamicLocations.some(
      (x) => x.pointer === '/dynamic' && x.constraint === '#node',
    ),
  );
  assert.ok(
    catalog.dynamicLocations.some(
      (x) => x.pointer === '/child' && x.kind === 'recursive-schema',
    ),
  );
  assert.doesNotThrow(() => JSON.stringify(catalog));
});

test('the pointer catalog is model context, never a whitelist or automatic pointer repair', async () => {
  const source = await operation({
    type: 'object',
    properties: {
      result: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
    },
  });
  const target = materials.find((x) => x.callId === 'detail');
  const bindingMaterials = [{ callId: 'source', operation: source }, target];
  const plan = {
    gaps: [],
    calls: [
      { callId: 'source', bindings: [] },
      {
        callId: 'detail',
        bindings: [
          {
            kind: 'node-output',
            targetPointer: '/path/id',
            sourceNodeId: 'source',
            sourcePointer: '/result/runtimeKey',
          },
        ],
      },
    ],
  };
  const returned = await planApiBindings({
    materials: bindingMaterials,
    scenario: 'Use the explicitly requested runtimeKey field.',
    model: {
      withStructuredOutput() {
        return {
          async invoke(messages) {
            const input = JSON.parse(messages[1].content);
            const catalog = input.materials[0].responsePointerCatalog[0];
            assert.ok(
              catalog.declaredPointers.some((x) => x.pointer === '/result/id'),
            );
            assert.ok(
              !catalog.declaredPointers.some(
                (x) => x.pointer === '/result/runtimeKey',
              ),
            );
            assert.deepEqual(
              input.materials[0].operation.operation,
              source.operation,
            );
            assert.match(messages[0].content, /not exhaustive/);
            return plan;
          },
        };
      },
    },
  });
  assert.deepEqual(returned, plan);
  validateApiBindingAssignments({
    calls: returned.calls,
    materials: bindingMaterials,
  });
  const args = returned.calls[1];
  assert.deepEqual(
    materializeApiArguments(
      {},
      args.bindings,
      { source: { result: { runtimeKey: 'actual-id' } } },
      target,
    ),
    { path: { id: 'actual-id' } },
  );
  assert.throws(
    () =>
      materializeApiArguments(
        {},
        args.bindings,
        { source: { result: { id: 'not-a-substitute' } } },
        target,
      ),
    /Missing response pointer/,
  );
});
