import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiOperations,
  selectDefaultApiRequestMediaType,
} from '@openapi-flow/core';
import { selectApiRequestMediaType } from '@openapi-flow/langchain';
import { createReviewableWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';

const bodySchema = {
  type: 'object',
  properties: { Query: { type: 'string' } },
  required: ['Query'],
};
const content = Object.fromEntries(
  ['text/json', 'application/*+json', 'application/json'].map((name) => [
    name,
    { schema: bodySchema },
  ]),
);
const spec = {
  openapi: '3.1.0',
  info: { title: 'Multiple request media fixture', version: '1' },
  paths: {
    '/warmup': {
      post: {
        requestBody: { required: true, content },
        responses: { 200: { description: 'OK' } },
      },
    },
  },
};
async function operation(document = spec) {
  const catalog = await createApiCatalog([{ id: 'media', spec: document }]);
  return (
    await resolveApiOperations(
      catalog,
      catalog.operations.map((item) => item.key),
    )
  )[0];
}

test('zero or one declared request body format never calls the model', async () => {
  const model = {
    withStructuredOutput() {
      throw new Error('No model selection is needed');
    },
  };
  const none = globalThis.structuredClone(spec);
  delete none.paths['/warmup'].post.requestBody;
  assert.equal(
    await selectApiRequestMediaType({
      operation: await operation(none),
      scenario: 'Call once',
      model,
    }),
    undefined,
  );
  const single = globalThis.structuredClone(spec);
  single.paths['/warmup'].post.requestBody.content = {
    'application/json': { schema: bodySchema },
  };
  assert.equal(
    await selectApiRequestMediaType({
      operation: await operation(single),
      scenario: 'Send the body',
      model,
    }),
    'application/json',
  );
});

test('only an ambiguous choice uses the OAS default; explicit and invalid choices are not replaced', async () => {
  const contract = await operation();
  for (const choice of [null, 'text/json', 'application/xml', undefined]) {
    const model = {
      withStructuredOutput(schema) {
        return {
          async invoke() {
            return schema.parse({ requestMediaType: choice });
          },
        };
      },
    };
    const selected = selectApiRequestMediaType({
      operation: contract,
      scenario: 'Call the API',
      model,
    });
    if (choice === 'application/xml' || choice === undefined)
      await assert.rejects(selected);
    else
      assert.equal(
        await selected,
        choice === null ? 'application/json' : choice,
      );
  }
});

test('default preference uses declared formats, not content insertion order', async () => {
  const cases = [
    [
      ['text/json', 'application/*+json', 'application/json'],
      'application/json',
    ],
    [['application/json', 'text/json'], 'application/json'],
    [
      ['text/plain', 'application/x-www-form-urlencoded'],
      'application/x-www-form-urlencoded',
    ],
    [['text/plain', 'application/xml', '*/*'], 'application/xml'],
    [['*/*', 'text/plain', 'application/xml'], 'application/xml'],
    [['application/*+json', 'text/json'], 'text/json'],
    [['text/*', 'application/*'], 'application/*'],
  ];
  for (const [names, expected] of cases) {
    const document = globalThis.structuredClone(spec);
    document.paths['/warmup'].post.requestBody.content = Object.fromEntries(
      names.map((name) => [name, { schema: bodySchema }]),
    );
    const contract = await operation(document);
    assert.equal(selectDefaultApiRequestMediaType(contract), expected);
    assert.ok(Object.hasOwn(contract.operation.requestBody.content, expected));
  }
  const none = globalThis.structuredClone(spec);
  delete none.paths['/warmup'].post.requestBody;
  assert.equal(
    selectDefaultApiRequestMediaType(await operation(none)),
    undefined,
  );
  const contract = await operation();
  contract.operation.requestBody.content = {};
  assert.throws(
    () => selectDefaultApiRequestMediaType(contract),
    /requestBody.content has no request media type/,
  );
});

for (const selection of ['application/json', null])
  test(`official graph carries media selection ${selection} through bindings, values and HTTP compilation`, async () => {
    const calls = [];
    const model = {
      withStructuredOutput(schema, options) {
        return {
          async invoke(messages) {
            calls.push(options.name);
            const input = JSON.parse(messages[1].content);
            let output;
            switch (options.name) {
              case 'select_api_operations':
                output = {
                  operations: [
                    {
                      candidateId: input.candidates[0].candidateId,
                      purpose: 'Send JSON',
                    },
                  ],
                  gaps: [],
                };
                break;
              case 'select_api_request_media_type':
                assert.deepEqual(
                  schema.shape.requestMediaType.unwrap().options,
                  Object.keys(content),
                );
                assert.deepEqual(input.operation.requestBody.content, content);
                output = { requestMediaType: selection };
                break;
              case 'plan_api_bindings':
                assert.equal(
                  input.materials[0].requestMediaType,
                  'application/json',
                );
                output = {
                  calls: [{ callId: input.materials[0].callId, bindings: [] }],
                  gaps: [],
                };
                break;
              case 'generate_api_arguments':
                assert.equal(input.requestMediaType, 'application/json');
                output = {
                  values: { body: { Query: 'query { item { id } }' } },
                };
                break;
              case 'plan_reviewable_workflow_graph':
                output = {
                  additionalNativeNodes: [],
                  edges: [],
                  additionalGaps: [],
                  blockedCalls: [],
                };
                break;
              default:
                throw new Error('Unexpected stage ' + options.name);
            }
            return schema.parse(output);
          },
        };
      },
    };
    const result = await createReviewableWorkflowGenerationGraph({
      model,
      capabilities: createN8nNativeCapabilities(),
    }).invoke({
      workflowId: 'media',
      workflowName: 'Media selection',
      scenario: 'Send a JSON body with Query',
      sources: [{ id: 'media', spec }],
      trace: [],
    });
    assert.equal(result.status, 'complete');
    assert.deepEqual(calls, [
      'select_api_operations',
      'select_api_request_media_type',
      'plan_api_bindings',
      'generate_api_arguments',
      'plan_reviewable_workflow_graph',
    ]);
    assert.equal(
      result.reviewMaterials[0].arguments.requestMediaType,
      'application/json',
    );
    const node = result.workflow.nodes.find(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    );
    assert.equal(node.parameters.contentType, 'json');
    assert.equal(
      JSON.parse(node.parameters.jsonBody).Query,
      'query { item { id } }',
    );
  });
