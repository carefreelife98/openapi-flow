import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';
import { createWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import { createDagWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import { configurationSchema } from '../examples/langgraph-workflow/dist/schemas/configuration-schema.js';
import { graphMaterials, names } from './fixtures/request-binding-fixture.mjs';

const spec = {
  openapi: '3.1.0',
  info: { title: 'Deployment fixture', version: '1' },
  servers: [{ url: 'https://oas-server.example.test' }],
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
  },
  security: [{ bearer: [] }],
  paths: {
    '/items': { get: { responses: { 200: { description: 'Items' } } } },
    '/public': {
      get: { security: [], responses: { 200: { description: 'Public' } } },
    },
  },
};
const catalog = await createApiCatalog([
  { id: 'inventory', spec },
  { id: 'billing', spec },
]);
const operations = await resolveApiOperations(
  catalog,
  catalog.operations.map((item) => item.key),
);
const secured = operations.find(
  (item) => item.key.documentId === 'inventory' && item.path === '/items',
);
const anonymous = operations.find(
  (item) => item.key.documentId === 'inventory' && item.path === '/public',
);
const args = { callId: 'read', values: {}, bindings: [], unresolvedInputs: [] };
const fragment = (options = {}, operation = secured) =>
  createHttpRequestNode({
    operation,
    arguments: args,
    position: [300, 0],
    ...options,
  });
const exportNode = (node) =>
  assembleN8nWorkflow({
    id: 'template',
    name: 'Deployment template',
    nodes: [node],
    edges: [],
    starts: [node.nodeId],
  }).workflow.nodes.find((item) => item.type === 'n8n-nodes-base.httpRequest');

test('missing deployment emits SDK-valid URL and credential placeholders, never the OAS server', () => {
  const request = exportNode(fragment());
  assert.equal(request.parameters.url, 'https://replace_me.invalid/items');
  assert.equal(request.parameters.authentication, 'genericCredentialType');
  assert.equal(request.parameters.genericAuthType, 'httpBearerAuth');
  assert.equal(
    request.credentials.httpBearerAuth.id,
    'REPLACE_ME:inventory:bearer',
  );
  assert.equal(
    request.credentials.httpBearerAuth.name,
    'REPLACE_ME (inventory: bearer)',
  );
  assert.match(
    request.notes,
    /REPLACE_ME.*inventory.*baseUrl.*credentialBindings.bearer/,
  );
  assert.equal(request.notesInFlow, true);
  assert.equal(
    JSON.stringify(request).includes('oas-server.example.test'),
    false,
  );
});

test('address only keeps the supplied address and only placeholders the missing credential', () => {
  const request = exportNode(
    fragment({ baseUrl: 'https://provided.example.test/v1' }),
  );
  assert.equal(
    request.parameters.url,
    'https://provided.example.test/v1/items',
  );
  assert.match(
    request.notes,
    /requires credentialBindings.bearer before execution/,
  );
  assert.equal(request.notes.includes('requires baseUrl'), false);
});

test('credential only keeps the supplied reference and only placeholders the missing address', () => {
  const reference = {
    id: 'real-credential-id',
    name: 'User supplied credential',
  };
  const credentialBindings = { bearer: reference };
  const before = globalThis.structuredClone(credentialBindings);
  const request = exportNode(fragment({ credentialBindings }));
  assert.deepEqual(request.credentials.httpBearerAuth, reference);
  assert.match(request.notes, /requires baseUrl before execution/);
  assert.deepEqual(credentialBindings, before);
});

test('complete deployment emits the existing executable shape without template notes', () => {
  const request = exportNode(
    fragment({
      baseUrl: 'https://provided.example.test/v1',
      credentialBindings: { bearer: { id: 'real-id', name: 'Bearer' } },
    }),
  );
  assert.equal(
    request.parameters.url,
    'https://provided.example.test/v1/items',
  );
  assert.equal(request.credentials.httpBearerAuth.id, 'real-id');
  assert.equal(request.notes, undefined);
  assert.equal(JSON.stringify(request).includes('REPLACE_ME'), false);
});

test('anonymous operation never receives a credential placeholder', () => {
  const request = exportNode(fragment({}, anonymous));
  assert.equal(request.credentials, undefined);
  assert.equal(request.parameters.authentication, undefined);
  assert.match(request.notes, /requires baseUrl before execution/);
  assert.equal(request.notes.includes('credentialBindings'), false);
});

test('partial scheme maps get only the required missing binding without mutating caller input', () => {
  const bindings = { other: { id: 'other-id', name: 'Other' } };
  const before = globalThis.structuredClone(bindings);
  const request = exportNode(fragment({ credentialBindings: bindings }));
  assert.equal(
    request.credentials.httpBearerAuth.id,
    'REPLACE_ME:inventory:bearer',
  );
  assert.deepEqual(bindings, before);
  assert.equal(JSON.stringify(request).includes('other-id'), false);
});

test('provided invalid addresses or references are not silently replaced', () => {
  for (const baseUrl of [
    '',
    'relative',
    'ftp://host.test',
    'https://user:password@host.test',
    'https://host.test?a=1',
  ])
    assert.throws(() => fragment({ baseUrl }), /baseUrl/);
  for (const credentialBindings of [
    null,
    [],
    { bearer: null },
    { bearer: { id: 'real-id' } },
    { bearer: { id: '', name: 'Name' } },
    { bearer: { id: 'id', name: '   ' } },
    { bearer: { id: 'id', name: 'Name', token: 'must-not-be-in-json' } },
  ])
    assert.throws(() => fragment({ credentialBindings }), /credentialBindings/);
});

test('missing required API values still fail rather than getting deployment placeholders', () => {
  const material = graphMaterials.find(
    (item) => item.arguments.callId === 'detail',
  );
  assert.throws(
    () =>
      createHttpRequestNode({
        ...material,
        arguments: { ...args, bindings: [] },
        position: [300, 0],
      }),
    /missing.*\/path\/id/,
  );
});

test('bound request templates materialize typed values and retain visible deployment notes', () => {
  const material = graphMaterials.find(
    (item) => item.arguments.callId === 'detail',
  );
  const bound = createHttpRequestNode({
    ...material,
    position: [300, 0],
    apiNodeNames: names,
  });
  for (const node of bound.nodes) {
    assert.match(node.config.notes, /REPLACE_ME.*consumer-service.*baseUrl/);
    assert.equal(node.config.notesInFlow, true);
  }
  const result = vm.runInNewContext(
    `(function(){${bound.entry.config.parameters.jsCode}})()`,
    {
      $: () => ({ all: () => [{ json: { body: { id: 'a/b' } } }] }),
    },
  );
  assert.equal(result[0].json.url, 'https://replace_me.invalid/detail/a%2Fb');
  assert.equal(bound.exit.config.parameters.url, '={{ $json.url }}');
});

function model() {
  let calls = 0;
  return {
    calls: () => calls,
    withStructuredOutput() {
      return {
        async invoke(messages) {
          calls++;
          const payload = JSON.parse(messages[1].content);
          assert.equal(
            JSON.stringify(payload).includes('actual-address.example.test'),
            false,
          );
          assert.equal(
            JSON.stringify(payload).includes('user-credential-id'),
            false,
          );
          if (payload.candidates)
            return {
              operations: [
                {
                  candidateId: payload.candidates.find(
                    (item) => item.path === '/items',
                  ).candidateId,
                  purpose: 'Read items',
                },
              ],
              gaps: [],
            };
          return { values: {} };
        },
      };
    },
  };
}
const input = {
  workflowId: 'template',
  workflowName: 'Template',
  scenario: 'Read items',
  sources: [
    { id: 'inventory', spec },
    { id: 'billing', spec },
  ],
  trace: [],
};

test('official LangGraph generates a secured template with the entire deployments input omitted', async () => {
  const chat = model();
  const result = await createWorkflowGenerationGraph({ model: chat }).invoke(
    input,
  );
  assert.equal(chat.calls(), 1);
  const request = result.workflow.nodes.find(
    (item) => item.type === 'n8n-nodes-base.httpRequest',
  );
  assert.equal(request.parameters.url, 'https://replace_me.invalid/items');
  assert.match(request.credentials.httpBearerAuth.id, /^REPLACE_ME:/);
});

test('official LangGraph accepts partial per-OAS configuration without passing deployment to LLM', async () => {
  const chat = model();
  const result = await createWorkflowGenerationGraph({
    model: chat,
    deployments: [
      { documentId: 'inventory' },
      {
        documentId: 'billing',
        baseUrl: 'https://actual-address.example.test',
        credentialBindings: {
          bearer: { id: 'user-credential-id', name: 'User credential' },
        },
      },
    ],
  }).invoke(input);
  const request = result.workflow.nodes.find(
    (item) => item.type === 'n8n-nodes-base.httpRequest',
  );
  assert.equal(request.parameters.url, 'https://replace_me.invalid/items');
  assert.match(request.notes, /inventory/);
});

test('unknown, duplicate or malformed per-OAS configuration fails rather than being ignored', async () => {
  for (const deployments of [
    [{ documentId: 'unknown' }],
    [{ documentId: 'inventory' }, { documentId: 'inventory' }],
    [{ documentId: 'inventory', basUrl: 'https://typo.example.test' }],
    [{ documentId: 'inventory', baseUrl: 'ftp://wrong.example.test' }],
    [
      {
        documentId: 'inventory',
        baseUrl: 'https://user:password@example.test',
      },
    ],
    [{ documentId: 'inventory', baseUrl: 'https://example.test?query=1' }],
    [{ documentId: 'inventory', credentialBindings: { bearer: { id: 'id' } } }],
  ]) {
    const chat = model();
    await assert.rejects(
      async () =>
        createWorkflowGenerationGraph({ model: chat, deployments }).invoke(
          input,
        ),
      /deployments|Unrecognized key|baseUrl|name/,
    );
    assert.equal(chat.calls(), 0);
  }
});

test('CLI deployment JSON is optional while supplied invalid JSON/configuration is rejected', () => {
  const environment = {
    LLM_BASE_URL: 'https://llm.example.test/v1',
    LLM_API_KEY: 'test-only',
    LLM_MODEL: 'example',
    LLM_HEADERS_JSON: '{}',
    OAS_SOURCES_JSON: '[{"id":"inventory","file":"spec.json"}]',
    SCENARIO: 'Read items',
    WORKFLOW_ID: 'template',
    WORKFLOW_NAME: 'Template',
    OUTPUT_FILE: 'output.json',
  };
  assert.equal(
    configurationSchema.parse(environment).DEPLOYMENTS_JSON,
    undefined,
  );
  assert.deepEqual(
    configurationSchema.parse({
      ...environment,
      DEPLOYMENTS_JSON: '[{"documentId":"inventory"}]',
    }).DEPLOYMENTS_JSON,
    [{ documentId: 'inventory' }],
  );
  assert.throws(() =>
    configurationSchema.parse({ ...environment, DEPLOYMENTS_JSON: '' }),
  );
  assert.throws(() =>
    configurationSchema.parse({
      ...environment,
      DEPLOYMENTS_JSON: '[{"documentId":"inventory","baseUrl":"bad"}]',
    }),
  );
});

test('two selected OAS documents independently apply their partial deployment options', async () => {
  const chat = {
    withStructuredOutput() {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          return {
            operations: payload.candidates
              .filter((item) => item.path === '/items')
              .map((item) => ({
                candidateId: item.candidateId,
                purpose: 'Read items',
              })),
            gaps: [],
          };
        },
      };
    },
  };
  const result = await createDagWorkflowGenerationGraph({
    model: chat,
    deployments: [
      { documentId: 'inventory', baseUrl: 'https://inventory.example.test' },
      {
        documentId: 'billing',
        credentialBindings: {
          bearer: { id: 'billing-id', name: 'Billing bearer' },
        },
      },
    ],
    reviewSelection(selection) {
      assert.equal(selection.operations.length, 2);
    },
    composeDag(requests) {
      return {
        nodes: requests.map((item) => item.fragment),
        edges: [],
        starts: requests.map((item) => item.fragment.nodeId),
      };
    },
  }).invoke(input);
  const requests = result.workflow.nodes.filter(
    (item) => item.type === 'n8n-nodes-base.httpRequest',
  );
  const inventory = requests.find(
    (item) => item.parameters.url === 'https://inventory.example.test/items',
  );
  const billing = requests.find(
    (item) => item.credentials.httpBearerAuth.id === 'billing-id',
  );
  assert.equal(
    inventory.credentials.httpBearerAuth.id,
    'REPLACE_ME:inventory:bearer',
  );
  assert.equal(billing.parameters.url, 'https://replace_me.invalid/items');
  assert.match(billing.notes, /OAS billing requires baseUrl/);
});

test('deployment placeholders do not silently select an OAS authentication alternative', async () => {
  const alternateSpec = globalThis.structuredClone(spec);
  alternateSpec.security = [{ bearer: [] }, {}];
  const alternateCatalog = await createApiCatalog([
    { id: 'alternate', spec: alternateSpec },
  ]);
  const [operation] = await resolveApiOperations(alternateCatalog, [
    alternateCatalog.operations.find((item) => item.path === '/items').key,
  ]);
  assert.throws(
    () => fragment({}, operation),
    /securityRequirementIndex is required/,
  );
});
