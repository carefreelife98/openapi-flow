import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { URLSearchParams } from 'node:url';
import { promisify } from 'node:util';
import {
  compileCatalogSequence,
  compileInboundWorkflow,
  compileWorkflow,
} from '@openapi-flow/n8n/legacy';
import {
  inboundOperationsFromSpec,
  createApiCatalog,
  resolveApiOperations,
} from '@openapi-flow/core';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';

const image = 'n8nio/n8n:2.37.10';
const suffix = `${process.pid}-${Date.now()}`;
const volume = `openapi-flow-smoke-${suffix}`;
const container = `openapi-flow-smoke-${suffix}`;
const received = [];
const execFileAsync = promisify(execFile);

function docker(args, input) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    ...(input === undefined ? {} : { input }),
    timeout: 90_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function n8n(args, input) {
  return docker(
    [
      'run',
      '--rm',
      '-i',
      '--mount',
      `source=${volume},target=/home/node/.n8n`,
      '-e',
      'N8N_DIAGNOSTICS_ENABLED=false',
      image,
      ...args,
    ],
    input,
  );
}

async function n8nAsync(args) {
  const { stdout } = await execFileAsync(
    'docker',
    [
      'run',
      '--rm',
      '--mount',
      `source=${volume},target=/home/node/.n8n`,
      '-e',
      'N8N_DIAGNOSTICS_ENABLED=false',
      image,
      ...args,
    ],
    { timeout: 90_000 },
  );
  return stdout;
}

function inboundSpec() {
  const response = {
    202: {
      description: 'accepted',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['ok'],
            properties: { ok: { type: 'boolean' } },
          },
        },
      },
    },
  };
  return {
    openapi: '3.2.1',
    info: { title: 'Local inbound smoke', version: '1' },
    paths: {
      '/register': {
        post: {
          responses: { 202: { description: 'accepted' } },
          callbacks: {
            onDone: {
              '{$request.body#/callbackUrl}': {
                post: { responses: response },
              },
            },
          },
        },
      },
    },
    webhooks: { onEvent: { post: { responses: response } } },
  };
}

async function waitForServer(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await globalThis.fetch(
        `http://127.0.0.1:${port}/healthz`,
      );
      if (response.ok) return;
    } catch {
      // The isolated n8n server has not finished starting.
    }
    await delay(1000);
  }
  throw new Error('local n8n instance did not become healthy');
}

async function callPublishedWebhook(port, result) {
  let lastResponse = '';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await globalThis.fetch(
      `http://127.0.0.1:${port}/webhook/${result.plan.webhookPath}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ example: true }),
      },
    );
    if (response.status === 202) {
      assert.deepEqual(await response.json(), { ok: true });
      return;
    }
    lastResponse = `${response.status}: ${await response.text()}`;
    await delay(1000);
  }
  throw new Error(`${result.evidence.source} webhook returned ${lastResponse}`);
}

const responder = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  received.push({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: Buffer.concat(chunks).toString('utf8'),
  });
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(
    JSON.stringify(
      request.url === '/catalog/create' ? { id: 'c-42' } : { ok: true },
    ),
  );
});

let volumeCreated = false;
let containerStarted = false;
try {
  await new Promise((resolve) => responder.listen(0, '0.0.0.0', resolve));
  const address = responder.address();
  assert.ok(address && typeof address !== 'string');
  const operationRef = '#/paths/~1items~1{color}/get';
  const restSpec = {
    openapi: '3.2.1',
    info: { title: 'Local REST smoke', version: '1' },
    paths: {
      '/items/{color}': {
        get: {
          parameters: [
            {
              name: 'color',
              in: 'path',
              required: true,
              style: 'matrix',
              explode: true,
              schema: {
                type: 'object',
                properties: { R: { type: 'integer' }, G: { type: 'integer' } },
              },
            },
            {
              name: 'tags',
              in: 'query',
              schema: { type: 'array', items: { type: 'string' } },
            },
          ],
          responses: { 200: { description: 'ok' } },
        },
      },
    },
  };
  const rest = await compileWorkflow({
    spec: restSpec,
    baseUrl: `http://host.docker.internal:${address.port}`,
    profile: 'read-only',
    effectPolicy: { [operationRef]: 'read' },
    credentialBindings: {},
    plan: {
      version: '1',
      goal: 'Check serialization',
      operationRef,
      inputs: {
        'path.color': { R: 100, G: 200 },
        'query.tags': ['blue', 'black'],
      },
    },
  });
  assert.equal(rest.status, 'complete');
  const apiCatalog = await createApiCatalog([
    { id: 'rest-service', spec: restSpec },
  ]);
  const [contract] = await resolveApiOperations(apiCatalog, [
    apiCatalog.operations[0].key,
  ]);
  const fragments = [
    'composable-first',
    'composable-left',
    'composable-right',
  ].map((callId) =>
    createHttpRequestNode({
      operation: contract,
      arguments: {
        callId,
        values: {
          path: { color: { R: 100, G: 200 } },
          query: { tags: ['blue', 'black'] },
        },
        bindings: [],
        unresolvedInputs: [],
      },
      baseUrl: `http://host.docker.internal:${address.port}`,
      credentialBindings: {},
      position: [300, 0],
    }),
  );
  const composed = assembleN8nWorkflow({
    id: 'composable-local-dag',
    name: 'Composable local DAG',
    nodes: [fragments[2], fragments[0], fragments[1]],
    starts: ['composable-first'],
    edges: [
      {
        from: 'composable-first',
        output: 'main',
        to: 'composable-left',
        input: 'main',
      },
      {
        from: 'composable-first',
        output: 'main',
        to: 'composable-right',
        input: 'main',
      },
    ],
  });
  const formOperationRef = '#/paths/~1forms/post';
  const formSpec = {
    openapi: '3.2.1',
    info: { title: 'Local form smoke', version: '1' },
    paths: {
      '/forms': {
        post: {
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  required: ['address', 'tags'],
                  properties: {
                    address: {
                      type: 'object',
                      properties: { city: { type: 'string' } },
                    },
                    tags: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'ok' } },
        },
      },
    },
  };
  const form = await compileWorkflow({
    spec: formSpec,
    baseUrl: `http://host.docker.internal:${address.port}`,
    profile: 'test',
    effectPolicy: { [formOperationRef]: 'write' },
    credentialBindings: {},
    plan: {
      version: '1',
      goal: 'Check complex form',
      operationRef: formOperationRef,
      inputs: { body: { address: { city: 'New York' }, tags: ['a', 'b'] } },
    },
  });
  assert.equal(form.status, 'complete');
  const createRef = '#/paths/~1catalog~1create/post';
  const readRef = '#/paths/~1catalog~1read~1{id}/get';
  const catalog = await compileCatalogSequence({
    sources: [
      {
        id: 'catalog-writer',
        spec: {
          openapi: '3.1.0',
          info: { title: 'Catalog writer', version: '1' },
          paths: {
            '/catalog/create': {
              post: {
                requestBody: {
                  required: true,
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['name'],
                        properties: { name: { type: 'string' } },
                      },
                    },
                  },
                },
                responses: {
                  200: {
                    description: 'created',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: { id: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        baseUrl: `http://host.docker.internal:${address.port}`,
        effectPolicy: { [createRef]: 'write' },
        credentialBindings: {},
      },
      {
        id: 'catalog-reader',
        spec: {
          openapi: '3.1.0',
          info: { title: 'Catalog reader', version: '1' },
          paths: {
            '/catalog/read/{id}': {
              get: {
                parameters: [
                  {
                    name: 'id',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' },
                  },
                ],
                responses: { 200: { description: 'read' } },
              },
            },
          },
        },
        baseUrl: `http://host.docker.internal:${address.port}`,
        effectPolicy: { [readRef]: 'read' },
        credentialBindings: {},
      },
    ],
    profile: 'test',
    plan: {
      version: '1',
      goal: 'Create and read across two OAS documents',
      steps: [
        {
          id: 'create',
          documentId: 'catalog-writer',
          operationRef: createRef,
          inputs: { body: { name: 'demo' } },
        },
        {
          id: 'read',
          documentId: 'catalog-reader',
          operationRef: readRef,
          inputs: { 'path.id': { fromStep: 'create', field: 'id' } },
        },
      ],
    },
  });
  assert.equal(catalog.status, 'complete');
  const spec = inboundSpec();
  const candidates = await inboundOperationsFromSpec(spec);
  const inbound = await Promise.all(
    candidates.map((candidate) =>
      compileInboundWorkflow({
        spec,
        plan: {
          version: '1',
          goal: 'Acknowledge locally',
          operationRef: candidate.operationRef,
          webhookPath: `openapi-flow-${candidate.source}-${suffix}`,
          responseStatus: 202,
          responseBody: { ok: true },
        },
      }),
    ),
  );
  docker(['volume', 'create', volume]);
  volumeCreated = true;
  for (const result of [rest, form, catalog, composed, ...inbound]) {
    n8n(
      ['import:workflow', '--input=/dev/stdin'],
      JSON.stringify(result.workflow),
    );
  }
  for (const result of inbound) {
    n8n(['publish:workflow', `--id=${result.workflow.id}`]);
  }
  await n8nAsync(['execute', `--id=${rest.workflow.id}`, '--rawOutput']);
  assert.equal(received.length, 1);
  assert.equal(received[0].url, '/items/;R=100;G=200?tags=blue&tags=black');
  await n8nAsync(['execute', `--id=${form.workflow.id}`, '--rawOutput']);
  assert.equal(received.length, 2);
  assert.equal(received[1].method, 'POST');
  assert.equal(received[1].url, '/forms');
  assert.match(
    received[1].headers['content-type'],
    /^application\/x-www-form-urlencoded/,
  );
  assert.equal(received[1].body, form.workflow.nodes[1].parameters.body);
  const submitted = new URLSearchParams(received[1].body);
  assert.deepEqual(JSON.parse(submitted.get('address')), { city: 'New York' });
  assert.deepEqual(submitted.getAll('tags'), ['a', 'b']);
  const catalogExecution = await n8nAsync([
    'execute',
    `--id=${catalog.workflow.id}`,
    '--rawOutput',
  ]);
  assert.match(catalogExecution, /"status"\s*:\s*"success"/);
  assert.equal(received.length, 4);
  assert.equal(received[2].url, '/catalog/create');
  assert.equal(received[3].url, '/catalog/read/c-42');
  const composedExecution = await n8nAsync([
    'execute',
    `--id=${composed.workflow.id}`,
    '--rawOutput',
  ]);
  assert.match(composedExecution, /"status"\s*:\s*"success"/);
  assert.equal(received.length, 7);
  assert.deepEqual(
    received.slice(4).map((request) => request.url),
    Array(3).fill('/items/;R=100;G=200?tags=blue&tags=black'),
  );
  docker([
    'run',
    '--rm',
    '-d',
    '--name',
    container,
    '--mount',
    `source=${volume},target=/home/node/.n8n`,
    '-e',
    'N8N_DIAGNOSTICS_ENABLED=false',
    '-p',
    '127.0.0.1::5678',
    image,
  ]);
  containerStarted = true;
  const port = Number(
    docker(['port', container, '5678/tcp']).split(':').at(-1),
  );
  assert.ok(Number.isInteger(port) && port > 0);
  await waitForServer(port);
  for (const result of inbound) {
    await callPublishedWebhook(port, result);
  }
  process.stdout.write(
    JSON.stringify({
      image,
      rest: 'matrix path, repeated query, and complex form verified',
      catalog: 'cross-document response binding verified',
      composed: 'independent request nodes and explicit fan-out DAG executed',
      inbound: inbound.map((item) => item.evidence.source),
      status: 202,
    }) + '\n',
  );
} catch (error) {
  if (containerStarted)
    process.stderr.write(docker(['logs', container]).slice(-8000) + '\n');
  throw error;
} finally {
  if (containerStarted) docker(['stop', container]);
  if (volumeCreated) docker(['volume', 'rm', volume]);
  responder.close();
}
