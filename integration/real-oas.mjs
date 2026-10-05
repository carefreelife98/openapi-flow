import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { compileWorkflow } from '@openapi-flow/n8n/legacy';
import {
  operationsFromSpec,
  validateOpenApi,
  createApiCatalog,
  listApiOperations,
  resolveApiOperations,
  createApiArgumentsSchema,
} from '@openapi-flow/core';
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
if (files.length === 0) {
  throw new Error(`OPENAPI_FLOW_REAL_OAS_DIR has no JSON files: ${directory}`);
}

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
