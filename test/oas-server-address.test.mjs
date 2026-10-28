import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import { createHttpRequestNode } from '@openapi-flow/n8n';

async function address({ servers, pathServers, operationServers }) {
  const spec = {
    openapi: '3.1.0',
    info: { title: 'Server ownership', version: '1' },
    ...(servers === undefined ? {} : { servers }),
    paths: {
      '/items': {
        ...(pathServers === undefined ? {} : { servers: pathServers }),
        get: {
          ...(operationServers === undefined
            ? {}
            : { servers: operationServers }),
          responses: { 200: { description: 'OK' } },
        },
      },
    },
  };
  const original = globalThis.structuredClone(spec);
  const catalog = await createApiCatalog([{ id: 'service', spec }]);
  const [operation] = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const node = createHttpRequestNode({
    operation,
    arguments: {
      callId: 'read',
      values: {},
      bindings: [],
      unresolvedInputs: [],
    },
    position: [0, 0],
  });
  assert.deepEqual(spec, original);
  return node.nodes.find((entry) => entry.type === 'n8n-nodes-base.httpRequest')
    .config;
}

test('effective OAS server precedence is operation, path, root; first server wins without environmental inference', async () => {
  const servers = [
    { url: 'https://root.test/v1' },
    { url: 'https://other.test' },
  ];
  assert.equal(
    (await address({ servers })).parameters.url,
    'https://root.test/v1/items',
  );
  const pathServers = [{ url: 'https://path.test/v2' }];
  assert.equal(
    (await address({ servers, pathServers })).parameters.url,
    'https://path.test/v2/items',
  );
  assert.equal(
    (
      await address({
        servers,
        pathServers,
        operationServers: [{ url: 'https://operation.test/v3' }],
      })
    ).parameters.url,
    'https://operation.test/v3/items',
  );
});

test('OAS server variables use their declared defaults; relative or absent servers get a visible host placeholder', async () => {
  const variable = await address({
    servers: [
      {
        url: 'https://{environment}.test/{version}',
        variables: {
          environment: { default: 'dev', enum: ['dev', 'prod'] },
          version: { default: 'v2' },
        },
      },
    ],
  });
  assert.equal(variable.parameters.url, 'https://dev.test/v2/items');
  assert.equal(variable.notes, undefined);
  for (const servers of [undefined, [], [{ url: '/' }], [{ url: '/v2' }]]) {
    const result = await address({ servers });
    assert.equal(
      result.parameters.url,
      `https://replace_me.invalid${servers?.[0]?.url === '/v2' ? '/v2' : ''}/items`,
    );
    assert.match(result.notes, /REPLACE_ME.*baseUrl/);
  }
});
