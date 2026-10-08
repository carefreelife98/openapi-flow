import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiOperations,
  resolveOpenApiSecurity,
} from '@openapi-flow/core';
import {
  createHttpRequestNode,
  assembleN8nWorkflow,
  resolveHttpRequestAuthentication,
} from '@openapi-flow/n8n';

async function contract(schemes, security = [{ auth: [] }], operationSecurity) {
  const spec = {
    openapi: '3.1.0',
    info: { title: 'Authentication', version: '1' },
    components: { securitySchemes: schemes },
    security,
    paths: {
      '/data': {
        get: {
          ...(operationSecurity === undefined
            ? {}
            : { security: operationSecurity }),
          responses: { 200: { description: 'ok' } },
        },
      },
    },
  };
  const catalog = await createApiCatalog([{ id: 'auth-service', spec }]);
  return (await resolveApiOperations(catalog, [catalog.operations[0].key]))[0];
}

const schemes = [
  [{ type: 'http', scheme: 'bearer' }, 'httpBearerAuth'],
  [{ type: 'http', scheme: 'basic' }, 'httpBasicAuth'],
  [{ type: 'http', scheme: 'digest' }, 'httpDigestAuth'],
  [{ type: 'apiKey', in: 'header', name: 'X-Fixture-Key' }, 'httpHeaderAuth'],
  [{ type: 'apiKey', in: 'query', name: 'api_key' }, 'httpQueryAuth'],
  [
    {
      type: 'oauth2',
      flows: {
        clientCredentials: {
          tokenUrl: 'https://auth.example.test/token',
          scopes: { 'inventory:read': 'Read' },
        },
      },
    },
    'oAuth2Api',
  ],
];

test('standard OAS authentication maps to SDK credential references without secrets or model work', async () => {
  for (const [definition, type] of schemes) {
    const operation = await contract({ auth: definition });
    const input = {
      operation,
      arguments: {
        callId: 'read',
        values: {},
        bindings: [],
        unresolvedInputs: [],
      },
      baseUrl: 'https://api.example.test',
      credentialBindings: {
        auth: { id: 'existing-id', name: 'Existing credential' },
      },
      position: [300, 0],
    };
    const original = globalThis.structuredClone(input);
    const fragment = createHttpRequestNode(input);
    const result = assembleN8nWorkflow({
      id: 'auth-' + type,
      name: type,
      nodes: [fragment],
      edges: [],
      starts: ['read'],
    });
    const request = result.workflow.nodes.find(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    );
    assert.equal(request.parameters.authentication, 'genericCredentialType');
    assert.equal(request.parameters.genericAuthType, type);
    assert.equal(request.credentials[type].id, 'existing-id');
    assert.deepEqual(Object.keys(request.credentials[type]).sort(), [
      'id',
      'name',
    ]);
    assert.deepEqual(input, original);
    if (definition.type === 'apiKey')
      assert.ok(request.notes.includes(JSON.stringify(definition.name)));
    if (definition.type === 'oauth2')
      assert.match(request.notes, /required scopes/);
  }
});

test('each supported scheme preserves optional deployment placeholders rather than omitting authentication', async () => {
  for (const [definition, type] of schemes) {
    const fragment = createHttpRequestNode({
      operation: await contract({ auth: definition }),
      arguments: {
        callId: 'read',
        values: {},
        bindings: [],
        unresolvedInputs: [],
      },
      position: [300, 0],
    });
    assert.equal(fragment.exit.config.parameters.genericAuthType, type);
    assert.match(fragment.exit.config.notes, /REPLACE_ME/);
  }
});

test('OR alternatives require explicit selection; anonymous alternatives do not silently disable authentication', async () => {
  const operation = await contract(
    { auth: { type: 'http', scheme: 'basic' } },
    [{ auth: [] }, {}],
  );
  assert.throws(
    () => resolveHttpRequestAuthentication({ operation }),
    /securityRequirementIndex is required/,
  );
  assert.equal(
    resolveHttpRequestAuthentication({ operation, securityRequirementIndex: 0 })
      .credentialType,
    'httpBasicAuth',
  );
  assert.equal(
    resolveHttpRequestAuthentication({
      operation,
      securityRequirementIndex: 1,
    }),
    undefined,
  );
  for (const index of [-1, 2, 0.5])
    assert.throws(
      () =>
        resolveHttpRequestAuthentication({
          operation,
          securityRequirementIndex: index,
        }),
      /not declared/,
    );
});

test('shared security resolution preserves AND schemes and scopes; the adapter never drops one to compile', async () => {
  const operation = await contract(
    {
      auth: { type: 'http', scheme: 'bearer' },
      key: { type: 'apiKey', in: 'header', name: 'X-Key' },
    },
    [{ auth: [], key: [] }],
  );
  const selection = resolveOpenApiSecurity({
    operationRef: operation.key.operationRef,
    ...operation.effective,
  });
  assert.deepEqual(
    selection.schemes.map((s) => s.name),
    ['auth', 'key'],
  );
  assert.throws(
    () => resolveHttpRequestAuthentication({ operation }),
    /combined security/,
  );
  const oauth = await contract({ auth: schemes[5][0] }, [
    { auth: ['inventory:read'] },
  ]);
  assert.match(
    resolveHttpRequestAuthentication({ operation: oauth })
      .credentialRequirements,
    /inventory:read/,
  );
});

test('operation security overrides root security and unsupported mappings are distinct from OAS intake', async () => {
  const unsupported = await contract({
    auth: {
      type: 'openIdConnect',
      openIdConnectUrl: 'https://auth.example.test/discovery',
    },
  });
  assert.throws(
    () => resolveHttpRequestAuthentication({ operation: unsupported }),
    /no implemented HTTP Request credential mapping/,
  );
  const anonymous = await contract(
    { auth: { type: 'http', scheme: 'bearer' } },
    [{ auth: [] }],
    [],
  );
  assert.equal(
    resolveHttpRequestAuthentication({ operation: anonymous }),
    undefined,
  );
  const missing = globalThis.structuredClone(unsupported);
  delete missing.effective.securitySchemes.auth;
  assert.throws(
    () => resolveHttpRequestAuthentication({ operation: missing }),
    /securitySchemes.auth/,
  );
});
