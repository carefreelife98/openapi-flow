import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';
import process from 'node:process';
import test from 'node:test';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { compileWorkflow } from '@openapi-flow/n8n/legacy';
import {
  compileReviewableN8nWorkflow,
  createN8nNativeCapabilities,
  createItemJoinCapability,
  createJsonOutputCapability,
  createN8nNativeOutputSources,
  createResponseArrayCapability,
} from '@openapi-flow/n8n';
import {
  operationsFromSpec,
  validateOpenApi,
  createApiCatalog,
  listApiOperations,
  resolveApiOperations,
  createApiArgumentsSchema,
  createReviewableWorkflowGraphPlan,
  createApiResponseSchema,
  createResponseArrayItemSchema,
} from '@openapi-flow/core';
import { createRequire } from 'node:module';
import { createOperationCatalog } from '@openapi-flow/core/internal';
import { generateWorkflow } from '../examples/legacy-generation/dist/generate-workflow.js';
import { createOperationSelectionSchema } from '../packages/langchain/dist/legacy/schemas/operation-selection-schema.js';

const directory = process.env.OPENAPI_FLOW_REAL_OAS_DIR;
if (!directory) {
  throw new Error('OPENAPI_FLOW_REAL_OAS_DIR is required by test:real-oas');
}

const entries = await readdir(directory, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  .map((entry) => entry.name)
  .sort();
const requireN8n = createRequire(
  new URL('../packages/n8n/package.json', import.meta.url),
);
const { Ajv2020 } = requireN8n('ajv/dist/2020.js');
const addFormats = requireN8n('ajv-formats');
const { z } = requireN8n('zod');
if (files.length === 0) {
  throw new Error(`OPENAPI_FLOW_REAL_OAS_DIR has no JSON files: ${directory}`);
}

test('private real OAS contracts compile full-response guards for native IF and assertions', async () => {
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    );
    const operation = operations.find((entry) =>
      Object.values(entry.operation.responses ?? {}).some(
        (response) => Object.keys(response.content ?? {}).length,
      ),
    );
    assert.ok(operation, 'each private OAS must have a response contract');
    const check = {
      left: { source: 'response', nodeId: 'source', pointer: '' },
      operator: 'notEquals',
      right: { source: 'literal', value: null },
    };
    for (const options of [{}, { itemMode: 'linked' }])
      for (const capability of createN8nNativeCapabilities(options).filter(
        (entry) => ['if', 'assert-responses'].includes(entry.name),
      )) {
        const fragment = capability.compile({
          planned: {
            id: 'check',
            capability: capability.name,
            parameters:
              capability.name === 'if'
                ? { combinator: 'and', conditions: [check] }
                : { checks: [{ ...check, message: 'Body must not be null' }] },
          },
          position: [0, 0],
          apiNodeNames: { source: 'Request source' },
          apiResponseContracts: { source: operation },
        });
        assert.equal(fragment.bindingSources[0].operation, operation);
        assert.equal(fragment.entry.type, 'n8n-nodes-base.code');
        assert.ok(
          fragment.entry.config.parameters.jsCode.includes(
            'OpenApiFlowResponseValidator0',
          ),
        );
      }
  }
});

test('private real OAS contracts compile two distinct call instances of the same operation into item-join readers', async () => {
  let count = 0;
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    const contracts = await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    );
    const candidates = contracts.filter((entry) =>
      Object.values(entry.operation.responses ?? {}).some(
        (response) => Object.keys(response.content ?? {}).length,
      ),
    );
    assert.ok(
      candidates.length >= 1,
      'each private OAS must supply a response-bearing operation',
    );
    const operations = [candidates[0], candidates[0]];
    const materials = operations.map((operation, i) => ({
      callId: 'call-' + i,
      operation,
    }));
    const scope = createJsonOutputCapability({
      name: 'private-scope',
      description: 'Explicit singleton regression scope.',
      parametersSchema: z.strictObject({ document: z.literal(file) }),
    });
    const scopes = createN8nNativeOutputSources({
      nativeNodes: [
        { id: 'scope', capability: scope.name, parameters: { document: file } },
      ],
      capabilities: [scope],
      apiNodeNames: {},
    });
    const capability = createItemJoinCapability({ materials, scopes });
    const parameters = {
      scopeNodeId: 'scope',
      sourceCallIds: materials.map((material) => material.callId),
    };
    const schema = capability.outputSchema(parameters);
    const ajv = new Ajv2020({
      strict: false,
      allErrors: true,
      discriminator: true,
    });
    addFormats(ajv);
    ajv.compile(schema);
    const fragment = capability.compile({
      planned: { id: 'join', capability: capability.name, parameters },
      position: [0, 0],
      apiNodeNames: Object.fromEntries(
        materials.map((material) => [material.callId, material.callId]),
      ),
    });
    assert.deepEqual(
      fragment.bindingSources
        .filter((source) => source.kind === 'api-response')
        .map((source) => source.operation),
      operations,
    );
    assert.equal(Object.keys(fragment.inputEndpoints).length, 2);
    count++;
  }
  assert.equal(count, files.length);
});

test('all private real OAS response contracts compile with the runtime validator without rewritten data', async () => {
  let count = 0;
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    );
    for (const operation of operations) {
      const ajv = new Ajv2020({
        strict: false,
        allErrors: true,
        discriminator: true,
      });
      addFormats(ajv);
      ajv.compile(createApiResponseSchema({ operation }));
      count++;
    }
  }
  assert.ok(count > 0);
});

test('private real OAS arrays derive item contracts and compile singleton and linked readers from original schemas', async () => {
  let count = 0;
  function pointers(schema, pointer = '') {
    if (!schema || typeof schema !== 'object') return [];
    return [
      ...(schema.type === 'array' ? [pointer] : []),
      ...Object.entries(schema.properties ?? {}).flatMap(([key, child]) =>
        pointers(
          child,
          pointer + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1'),
        ),
      ),
    ];
  }
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    for (const operation of await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    ))
      for (const response of Object.values(operation.operation.responses ?? {}))
        for (const media of Object.values(response.content ?? {}))
          for (const pointer of pointers(media.schema)) {
            assert.ok(createResponseArrayItemSchema(operation, pointer));
            for (const options of [{}, { itemMode: 'linked' }]) {
              const capability = createResponseArrayCapability({
                materials: [{ callId: 'source', operation }],
                ...options,
              });
              const fragment = capability.compile({
                planned: {
                  id: 'split',
                  capability: capability.name,
                  parameters: { sourceNodeId: 'source', pointer },
                },
                position: [0, 0],
                apiNodeNames: { source: 'Request source' },
              });
              assert.equal(fragment.exit.type, 'n8n-nodes-base.splitOut');
              assert.equal(fragment.bindingSources[0].operation, operation);
              assert.equal(
                fragment.entry.config.parameters.jsCode.includes(
                  'itemMatching(inputIndex)',
                ),
                options.itemMode === 'linked',
              );
            }
            count++;
          }
  }
  assert.ok(count > 0);
});

test('real OAS files form a multi-document operation catalog', async () => {
  const sources = await Promise.all(
    files.map(async (file) => ({
      id: file,
      spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      baseUrl: 'https://example.test',
      effectPolicy: {},
      credentialBindings: {},
    })),
  );
  const catalog = await createOperationCatalog(sources);
  assert.equal(catalog.sources.size, files.length);
  assert.equal(
    catalog.entries.length,
    (
      await Promise.all(
        sources.map((source) => operationsFromSpec(source.spec)),
      )
    ).reduce((count, operations) => count + operations.length, 0),
  );
  assert.ok(catalog.entries.every((entry) => files.includes(entry.id)));
});

const operationMethods = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
  'query',
]);

test('real OAS contracts preserve blocked API identities without fabricating request values', async () => {
  const sources = await Promise.all(
    files.map(async (file) => ({
      id: file,
      spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
    })),
  );
  const catalog = await createApiCatalog(sources);
  const selection = {
    operations: sources.map((source) => {
      const candidate = catalog.operations.find(
        (item) => item.key.documentId === source.id,
      );
      assert.ok(candidate);
      return {
        key: candidate.key,
        purpose: 'Review the confirmed service contract',
      };
    }),
    gaps: [
      {
        kind: 'missing_operation',
        description: 'Host-reported requirement needs API review',
      },
    ],
  };
  const contracts = await resolveApiOperations(
    catalog,
    selection.operations.map((item) => item.key),
  );
  const gaps = [
    {
      id: 'reported-review',
      stage: 'api-selection',
      description: selection.gaps[0].description,
    },
  ];
  const materials = contracts.map((operation, index) => ({
    status: 'blocked',
    callId: 'review-call-' + index,
    operation,
    bindings: [],
    gapIds: ['reported-review'],
  }));
  const capabilities = createN8nNativeCapabilities();
  const plan = createReviewableWorkflowGraphPlan({
    materials,
    capabilities,
    gaps,
    proposal: {
      nativeNodes: [],
      edges: [],
      blockedCalls: [],
      additionalGaps: [],
    },
  });
  const result = compileReviewableN8nWorkflow({
    id: 'private-oas-review',
    name: 'Private OAS review',
    materials,
    capabilities,
    plan,
    apiNodes: [],
  });
  assert.equal(result.status, 'needs-review');
  assert.equal(result.workflow.active, false);
  assert.equal(result.workflow.nodes.length, (files.length + 1) * 2 + 1);
  assert.deepEqual(result.workflow.connections, {});
  assert.ok(
    result.workflow.nodes.every((item) =>
      [
        'n8n-nodes-base.stickyNote',
        'n8n-nodes-base.code',
        'n8n-nodes-base.manualTrigger',
      ].includes(item.type),
    ),
  );
  assert.ok(
    result.workflow.nodes.every((item) => item.credentials === undefined),
  );
});

test('real OAS files use independent catalog and full contract lookup without runtime policy', async () => {
  const sources = await Promise.all(
    files.map(async (file) => ({
      id: file,
      spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
    })),
  );
  const catalog = await createApiCatalog(sources);
  const operations = listApiOperations(catalog);
  const contracts = await resolveApiOperations(
    catalog,
    operations.map((operation) => operation.key),
  );
  assert.equal(contracts.length, operations.length);
  for (const contract of contracts) {
    assert.ok(contract.operation.responses);
    assert.ok(files.includes(contract.key.documentId));
    const requestMediaTypes =
      contract.operation.requestBody === undefined
        ? [undefined]
        : Object.keys(contract.operation.requestBody.content);
    for (const requestMediaType of requestMediaTypes) {
      const schema = createApiArgumentsSchema({
        operation: contract,
        bindings: [],
        requestMediaType,
      });
      assert.equal(schema.safeParse({ values: {} }).success, true);
    }
  }
});

function pointerSegment(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

for (const [index, file] of files.entries()) {
  const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
  test(`real OAS ${index + 1} validates`, () => {
    const validated = validateOpenApi(spec);
    assert.ok(Object.keys(validated.paths).length > 0);
  });
  test(`real OAS ${index + 1} exposes operations`, async () => {
    const operations = await operationsFromSpec(spec);
    const expected = Object.entries(spec.paths).flatMap(([path, pathItem]) => [
      ...Object.entries(pathItem)
        .filter(([key]) => operationMethods.has(key))
        .map(([key, operation]) => ({
          operationRef: `#/paths/${pointerSegment(path)}/${key}`,
          source: 'paths',
          operationId: operation.operationId,
          method: key.toUpperCase(),
          path,
          summary: operation.summary ?? '',
          description: operation.description ?? '',
          tags: operation.tags ?? [],
        })),
      ...Object.entries(pathItem.additionalOperations ?? {}).map(
        ([method, operation]) => ({
          operationRef: `#/paths/${pointerSegment(path)}/additionalOperations/${pointerSegment(method)}`,
          source: 'paths',
          operationId: operation.operationId,
          method,
          path,
          summary: operation.summary ?? '',
          description: operation.description ?? '',
          tags: operation.tags ?? [],
        }),
      ),
    ]);
    assert.ok(expected.length > 0);
    assert.deepEqual(
      operations.toSorted((left, right) =>
        left.operationRef.localeCompare(right.operationRef),
      ),
      expected.toSorted((left, right) =>
        left.operationRef.localeCompare(right.operationRef),
      ),
    );
  });
  test(`real OAS ${index + 1} builds a Zod selection schema from its operations`, async () => {
    const operations = await operationsFromSpec(spec);
    const refs = operations.map((operation) => operation.operationRef);
    const schema = createOperationSelectionSchema(refs);
    const wireSchema = toJsonSchema(schema);
    assert.deepEqual(wireSchema.properties.operationRef.enum, refs);
    assert.deepEqual(schema.parse({ operationRef: refs[0] }), {
      operationRef: refs[0],
    });
  });
  if (file === 'honeypot-service.openapi.json') {
    test('Honeypot OAS generates a workflow from structured model selection and input', async () => {
      const operationRef = '#/paths/~1smoke~1changed/get';
      const model = {
        withStructuredOutput(schema, options) {
          assert.equal(
            options.method,
            options.name === 'select_operation'
              ? 'jsonSchema'
              : 'functionCalling',
          );
          assert.equal(
            options.strict,
            options.name === 'select_operation' ? true : undefined,
          );
          if (options.name === 'select_operation') {
            assert.ok(
              toJsonSchema(schema).properties.operationRef.enum.includes(
                operationRef,
              ),
            );
            return {
              async invoke(messages) {
                assert.ok(messages[0] instanceof SystemMessage);
                assert.ok(messages[1] instanceof HumanMessage);
                const request = JSON.parse(messages[1].content);
                assert.equal(request.scenario, 'Read changed items with max 5');
                return { operationRef };
              },
            };
          }
          assert.equal(options.name, 'plan_operation');
          assert.ok(
            toJsonSchema(schema).properties.inputs.properties.query.properties
              .max,
          );
          return {
            async invoke(messages) {
              assert.ok(messages[0] instanceof SystemMessage);
              assert.ok(messages[1] instanceof HumanMessage);
              const request = JSON.parse(messages[1].content);
              assert.equal(request.operation.operationRef, operationRef);
              return { inputs: { query: { max: 5 } } };
            },
          };
        },
      };
      const result = await generateWorkflow({
        spec,
        scenario: 'Read changed items with max 5',
        model,
        baseUrl: 'https://example.test',
        profile: 'read-only',
        effectPolicy: { [operationRef]: 'read' },
        credentialBindings: {},
      });
      assert.equal(result.status, 'complete');
      assert.equal(result.plan.operationRef, operationRef);
      assert.deepEqual(result.plan.inputs, { 'query.max': 5 });
      assert.deepEqual(
        result.workflow.nodes.map((node) => node.type),
        ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.httpRequest'],
      );
      assert.equal(
        result.workflow.nodes[1].parameters.url,
        'https://example.test/smoke/changed?max=5',
      );
    });
    test('Honeypot multi-response operation compiles without a planned status', async () => {
      const operationRef = '#/paths/~1smoke~1changed/get';
      const result = await compileWorkflow({
        spec,
        baseUrl: 'https://example.test',
        profile: 'read-only',
        effectPolicy: { [operationRef]: 'read' },
        credentialBindings: {},
        plan: {
          version: '1',
          goal: 'Read changed items',
          operationRef,
        },
      });
      assert.equal(result.status, 'complete');
      assert.equal(Object.hasOwn(result.evidence, 'status'), false);
      assert.deepEqual(
        result.workflow.nodes.map((node) => node.type),
        ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.httpRequest'],
      );
    });
  }
}
