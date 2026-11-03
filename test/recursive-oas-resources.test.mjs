import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { clarifyWorkflowRequirements } from '@openapi-flow/langchain';
import {
  createApiResponseResultsCapability,
  createHttpRequestNode,
} from '@openapi-flow/n8n';
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
import {
  createApiCatalog,
  resolveApiOperations,
  createApiResponseSchema,
  createApiRequestSchema,
  createResponseArrayItemSchema,
  createResponseArrayItemValueSchema,
  createResponseObjectEntrySchema,
  createResponseValueSchema,
  validateApiArguments,
  createWorkflowClarificationRound,
  createNativeOutputContracts,
  createNativeValueSchema,
  listSchemaResources,
  materializeApiArguments,
} from '@openapi-flow/core';
const { Ajv2020 } = createRequire(import.meta.resolve('@openapi-flow/core'))(
  'ajv/dist/2020.js',
);
import { recursiveOasDocument as document } from './fixtures/recursive-oas-fixture.mjs';

async function operation(spec) {
  const before = globalThis.structuredClone(spec);
  const catalog = await createApiCatalog([{ id: 'tree', spec }]);
  const [contract] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  assert.deepEqual(spec, before);
  assert.deepEqual(catalog.documents[0].spec, before);
  return contract;
}
function validate(schema, value) {
  const ajv = new Ajv2020({ strict: false });
  for (const resource of listSchemaResources(schema).reverse())
    if (resource.schema !== schema)
      ajv.addSchema(resource.schema, resource.uri);
  return ajv.compile(schema)(value);
}
const valid = { name: 'root', children: [{ name: 'child', children: [] }] };
const invalid = { name: 'root', children: [{ name: 4, children: [] }] };
for (const version of ['3.0.3', '3.1.0', '3.2.0']) {
  test(`recursive ${version} contracts survive JSON checkpoints and validate nested values`, async () => {
    const contract = JSON.parse(
      JSON.stringify(await operation(document(version))),
    );
    const response = createApiResponseSchema({ operation: contract });
    assert.equal(
      validate(response, {
        statusCode: 200,
        mediaType: 'application/json',
        body: valid,
      }),
      true,
    );
    assert.equal(
      validate(response, {
        statusCode: 200,
        mediaType: 'application/json',
        body: invalid,
      }),
      false,
    );
    const request = createApiRequestSchema({ operation: contract });
    assert.equal(validate(request, { body: valid }), true);
    assert.equal(validate(request, { body: invalid }), false);
    assert.equal(
      validateApiArguments({
        operation: contract,
        values: { body: valid },
        bindings: [],
      }).valid,
      true,
    );
    assert.throws(() =>
      validateApiArguments({
        operation: contract,
        values: { body: invalid },
        bindings: [],
      }),
    );
    const context = {
      messages: [{ id: 'user', text: 'Read a tree.' }],
      operations: [contract],
    };
    const round = createWorkflowClarificationRound({
      context,
      limits: {
        maxCategories: 1,
        maxQuestionsPerCategory: 1,
        maxChoicesPerQuestion: 2,
        maxQuestionsPerRound: 1,
      },
      options: { includeExplanations: false, includeSuggestions: false },
      proposal: {
        statements: [
          {
            text: 'Read a tree.',
            sources: [
              { kind: 'message', messageId: 'user', quote: 'Read a tree.' },
            ],
          },
        ],
        categories: [],
      },
    });
    assert.equal(typeof round.contextFingerprint, 'string');
    assert.deepEqual(JSON.parse(JSON.stringify(round)), round);
  });
}
test('recursive array, item and concrete field projections retain their validators', async () => {
  const contract = await operation(document());
  const item = createResponseArrayItemSchema(contract, '/children');
  assert.equal(validate(item, valid), true);
  assert.equal(validate(item, invalid), false);
  const name = createResponseArrayItemValueSchema(
    contract,
    '/children',
    '/children/0/name',
  );
  assert.equal(validate(name, 'leaf'), true);
  assert.equal(validate(name, 3), false);
  const deep = createResponseValueSchema(
    contract,
    '/children/0/children/0/name',
  );
  assert.equal(validate(deep, 'leaf'), true);
  assert.equal(validate(deep, false), false);
  const entry = createResponseObjectEntrySchema(contract, '', 'children');
  assert.equal(validate(entry, [valid]), true);
  assert.equal(validate(entry, [invalid]), false);
});
test('mutual recursion and shared declarations keep all assertions', async () => {
  const spec = document('3.1.0');
  spec.components.schemas.Node.properties.children.items = {
    $ref: '#/components/schemas/Branch',
  };
  spec.components.schemas.Branch = {
    type: 'object',
    required: ['child'],
    additionalProperties: false,
    properties: { child: { $ref: '#/components/schemas/Node' } },
  };
  spec.components.schemas.Node.properties.alias = {
    $ref: '#/components/schemas/Branch',
  };
  const contract = JSON.parse(JSON.stringify(await operation(spec)));
  const schema = createApiResponseSchema({ operation: contract });
  assert.equal(
    validate(schema, {
      statusCode: 200,
      mediaType: 'application/json',
      body: {
        name: 'root',
        children: [{ child: { name: 'leaf', children: [] } }],
      },
    }),
    true,
  );
  assert.equal(
    validate(schema, {
      statusCode: 200,
      mediaType: 'application/json',
      body: { name: 'root', children: [{ child: invalid }] },
    }),
    false,
  );
});
test('nullable recursive items preserve null and reject invalid non-null entries', async () => {
  const spec = document();
  spec.components.schemas.Node.nullable = true;
  const contract = await operation(spec);
  const schema = createApiResponseSchema({ operation: contract });
  assert.equal(
    validate(schema, {
      statusCode: 200,
      mediaType: 'application/json',
      body: { name: 'root', children: [null, valid] },
    }),
    true,
  );
  assert.equal(
    validate(schema, {
      statusCode: 200,
      mediaType: 'application/json',
      body: invalid,
    }),
    false,
  );
});
test('unresolved references fail with source context', async () => {
  const spec = document();
  spec.components.schemas.Node.properties.children.items.$ref =
    '#/components/schemas/Missing';
  await assert.rejects(operation(spec), /sources\[tree\].spec is invalid/);
});

test('nested missing required fields remain input requirements rather than generic schema errors', async () => {
  const contract = await operation(document());
  const result = validateApiArguments({
    operation: contract,
    values: { body: { name: 'root', children: [{ children: [] }] } },
    bindings: [],
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.missingInputs, ['/body/children/0/name']);
});

test('recursive requests accept nested bound fields and materialize declared containers', async () => {
  const contract = await operation(document());
  const bindings = [
    {
      kind: 'node-output',
      sourceNodeId: 'source',
      sourcePointer: '/name',
      targetPointer: '/body/children/0/name',
    },
  ];
  const result = validateApiArguments({
    operation: contract,
    values: { body: { name: 'root', children: [{ children: [] }] } },
    bindings,
  });
  assert.equal(result.valid, true);
  assert.equal(result.requiresRuntimeValidation, true);
});

test('LangChain clarifies a JSON-restored recursive operation without losing source identity', async () => {
  const contract = JSON.parse(JSON.stringify(await operation(document())));
  let calls = 0;
  const round = await clarifyWorkflowRequirements({
    context: {
      messages: [{ id: 'user', text: 'Read a tree.' }],
      operations: [contract],
    },
    limits: {
      maxCategories: 1,
      maxQuestionsPerCategory: 1,
      maxChoicesPerQuestion: 2,
      maxQuestionsPerRound: 1,
    },
    options: { includeExplanations: false, includeSuggestions: false },
    model: {
      withStructuredOutput(schema) {
        assert.doesNotThrow(() => JSON.stringify(schema));
        return {
          async invoke(messages) {
            calls++;
            assert.doesNotThrow(() => JSON.stringify(messages));
            return modelMessageEvidenceSelections({
              statements: [
                {
                  text: 'Read a tree.',
                  sources: [
                    {
                      kind: 'message',
                      messageId: 'user',
                      quote: 'Read a tree.',
                    },
                  ],
                },
              ],
              categories: [],
            });
          },
        };
      },
    },
  });
  assert.equal(calls, 1);
  assert.equal(round.statements[0].sources[0].messageId, 'user');
  assert.equal(typeof round.contextFingerprint, 'string');
});

test('multiple API results share recursive resources through a typed native output', async () => {
  const contract = await operation(document());
  const capability = createApiResponseResultsCapability({
    materials: ['left', 'right'].map((callId) => ({
      callId,
      operation: contract,
    })),
  });
  const [output] = createNativeOutputContracts({
    nativeNodes: [
      {
        id: 'gather',
        capability: capability.name,
        parameters: { sourceNodeIds: ['left', 'right'] },
      },
    ],
    capabilities: [capability],
  });
  const name = createNativeValueSchema(
    output,
    '/results/0/body/children/0/name',
  );
  assert.equal(validate(name, 'leaf'), true);
  assert.equal(validate(name, 7), false);
  const entries = (body) => ({
    results: ['left', 'right'].map((callId) => ({
      callId,
      documentId: 'tree',
      method: 'POST',
      path: '/tree',
      body,
    })),
  });
  assert.equal(validate(output.schema, entries(valid)), true);
  assert.equal(validate(output.schema, entries(invalid)), false);
});

test('resource registration respects relative IDs and schema positions, and rejects conflicting identities', () => {
  const schema = {
    $id: 'https://fixture.example/root.json',
    type: 'array',
    prefixItems: [{ $id: 'entry.json', type: 'string' }],
    example: { $id: 'data-only' },
  };
  const before = globalThis.structuredClone(schema);
  assert.deepEqual(
    listSchemaResources(schema).map((entry) => entry.uri),
    ['https://fixture.example/root.json', 'https://fixture.example/entry.json'],
  );
  assert.deepEqual(schema, before);
  assert.throws(
    () =>
      listSchemaResources({
        anyOf: [
          { $id: 'urn:fixture:conflict', type: 'number' },
          { $id: 'urn:fixture:conflict', type: 'string' },
        ],
      }),
    /conflicting resource ID/,
  );
});

test('recursive bound requests materialize nested arrays from closed schema references', async () => {
  const contract = await operation(document());
  const bindings = [
    {
      kind: 'node-output',
      sourceNodeId: 'source',
      sourcePointer: '',
      targetPointer: '/body/children/0/children/0',
    },
  ];
  const values = { body: { name: 'root', children: [{ name: 'child' }] } };
  assert.equal(
    validateApiArguments({ operation: contract, values, bindings }).valid,
    true,
  );
  const leaf = { name: 'leaf', children: [] };
  const result = materializeApiArguments(
    values,
    bindings,
    { source: leaf },
    { callId: 'sink', operation: contract },
  );
  assert.deepEqual(result, {
    body: { name: 'root', children: [{ name: 'child', children: [leaf] }] },
  });
  const fragment = createHttpRequestNode({
    operation: contract,
    arguments: { callId: 'sink', values, bindings, unresolvedInputs: [] },
    baseUrl: 'https://fixture.example',
    credentialBindings: {},
    apiNodeNames: { source: 'Source' },
    apiResponseContracts: { source: contract },
    position: [0, 0],
  });
  const output = vm.runInNewContext(
    `Object.defineProperty=()=>({});Object.defineProperties=()=>({});Object.getPrototypeOf=()=>({});(async()=>{${fragment.entry.config.parameters.jsCode}})()`,
    {
      $: () => ({
        all: () => [
          {
            json: {
              statusCode: 200,
              headers: { 'content-type': 'application/json' },
              body: leaf,
            },
          },
        ],
      }),
    },
  );
  const [request] = await output;
  assert.deepEqual(JSON.parse(request.json.body.value), result.body);
});
