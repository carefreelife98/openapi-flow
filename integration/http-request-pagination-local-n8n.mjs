import { URL, URLSearchParams } from 'node:url';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { node } from '@n8n/workflow-sdk';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';
import {
  paginationInput,
  pagePagination,
} from '../test/fixtures/http-request-pagination-fixture.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

// Adapter-only numeric QUERY pagination, not model planning or a collection output.
// Fixed maxRequests or explicit status-code termination; pages keep raw decoding.
// Unsupported: body parameter updates, body metadata/empty-body termination, nextURL.
// Official source: https://github.com/n8n-io/n8n/blob/n8n%402.37.10/packages/nodes-base/nodes/HttpRequest/V3/HttpRequestV3.node.ts
// Runtime: https://github.com/n8n-io/n8n/blob/n8n%402.37.10/packages/core/src/execution-engine/node-execution-context/utils/request-helpers/pagination.ts
// Docs: https://docs.n8n.io/build/code-in-n8n/cookbook/http-request-node/pagination/
const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-pagination-${process.pid}-${Date.now()}`;
const cases = [
  { id: 'page', expectedPages: 3 },
  { id: 'bound-page', expectedPages: 3, bound: true },
  { id: 'post-body', expectedPages: 3, method: 'post' },
  { id: 'status-stop', expectedPages: 2 },
  { id: 'status-stop-multiple', expectedPages: 4, multi: true },
  {
    id: 'budget-exhausted',
    error: 'pagination exhausted maxRequests before status-codes termination',
    expectedRequests: 1,
  },
  {
    id: 'last-error',
    error: 'pagination HTTP status 503',
    expectedRequests: 1,
  },
  {
    id: 'invalid-json',
    error: 'invalid JSON HTTP response',
    expectedRequests: 1,
  },
  {
    id: 'singleton-binding',
    error: 'requires an unambiguous single JSON item; got 3 items',
    expectedRequests: 3,
    sink: true,
  },
].filter((sample) => !process.argv[2] || sample.id === process.argv[2]);
const observed = new Map(cases.map((sample) => [sample.id, []]));
function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [],
      stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      }),
    );
    child.stdin.end(input);
  });
}
const wireBodies = new Map();
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const url = new URL(request.url, `http://${request.headers.host}`);
  const id = url.searchParams.get('scenario');
  const requests = observed.get(id);
  if (!requests) {
    response.writeHead(404);
    response.end();
    return;
  }
  requests.push([...url.searchParams.entries()]);
  if (id === 'post-body') {
    assert.equal(request.method, 'POST');
    const bodies = wireBodies.get(id) ?? [];
    bodies.push(Buffer.concat(chunks).toString());
    wireBodies.set(id, bodies);
  }
  const page = Number(url.searchParams.get('page'));
  const status =
    id === 'last-error'
      ? 503
      : ['status-stop', 'status-stop-multiple'].includes(id) && page === 2
        ? 204
        : 200;
  response.writeHead(status, { 'content-type': 'application/json' });
  if (status === 204) response.end();
  else if (id === 'invalid-json') response.end('{');
  else
    response.end(
      JSON.stringify(
        page === 2 ? '{"unchanged":true}' : page === 3 ? '' : '42',
      ),
    );
});
let created = false;
try {
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const workflows = [];
  for (const sample of cases) {
    const pagination = globalThis.structuredClone(pagePagination);
    if (['status-stop', 'status-stop-multiple'].includes(sample.id)) {
      pagination.maxRequests = 5;
      pagination.termination = { kind: 'status-codes', statusCodes: [204] };
    }
    if (sample.id === 'budget-exhausted') {
      pagination.maxRequests = 1;
      pagination.termination = { kind: 'status-codes', statusCodes: [204] };
    }
    if (['last-error', 'invalid-json'].includes(sample.id))
      pagination.maxRequests = 1;
    const input = await paginationInput({
      pagination,
      ...(sample.method
        ? {
            method: sample.method,
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['label'],
                    properties: { label: { type: 'string' } },
                  },
                },
              },
            },
          }
        : {}),
      query: {
        page: 1,
        scenario: sample.id,
        ...(sample.bound ? {} : { filter: 'A B&/' }),
      },
      parameters: [
        { in: 'query', name: 'scenario', schema: { type: 'string' } },
      ],
    });
    if (sample.method) input.arguments.values.body = { label: '42' };
    input.baseUrl = baseUrl;
    const nodes = [],
      edges = [];
    let starts = ['pages'];
    if (sample.bound || sample.multi) {
      const seed = node({
        type: 'n8n-nodes-base.code',
        version: 2,
        config: {
          id: 'seed',
          name: 'Request seed',
          position: [-220, 0],
          parameters: {
            mode: 'runOnceForAllItems',
            jsCode: sample.multi
              ? 'return [{json:{}},{json:{}}];'
              : 'return [{json:{statusCode:200,headers:{"content-type":"application/json"},body:"bound filter &/"}}];',
          },
        },
      });
      nodes.push({
        nodeId: 'seed',
        preservesInputItems: true,
        nodes: [seed],
        entry: seed,
        exit: seed,
        inputPorts: { main: 0 },
        outputPorts: { main: 0 },
      });
      if (sample.bound) {
        input.arguments.bindings.push({
          kind: 'node-output',
          targetPointer: '/query/filter',
          sourceNodeId: 'seed',
          sourcePointer: '',
        });
        input.apiNodeNames = { seed: 'Request seed' };
        input.apiResponseContracts = { seed: input.operation };
      }
      starts = ['seed'];
      edges.push({ from: 'seed', output: 'main', to: 'pages', input: 'main' });
    }
    nodes.push(createHttpRequestNode(input));
    if (sample.sink) {
      const sinkInput = globalThis.structuredClone(input);
      delete sinkInput.pagination;
      sinkInput.arguments.callId = 'sink';
      delete sinkInput.arguments.values.query.filter;
      sinkInput.arguments.bindings = [
        {
          kind: 'node-output',
          targetPointer: '/query/filter',
          sourceNodeId: 'pages',
          sourcePointer: '',
        },
      ];
      sinkInput.apiNodeNames = { pages: 'Request pages' };
      sinkInput.apiResponseContracts = { pages: input.operation };
      nodes.push(createHttpRequestNode(sinkInput));
      edges.push({ from: 'pages', output: 'main', to: 'sink', input: 'main' });
    }
    workflows.push(
      assembleN8nWorkflow({
        id: sample.id,
        name: `Official pagination ${sample.id}`,
        nodes,
        starts,
        edges,
      }).workflow,
    );
  }
  const directory = new URL(
    '../.local-artifacts/http-request-pagination/',
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('workflows.json', directory),
    JSON.stringify(workflows, null, 2),
  );
  assert.equal((await docker(['volume', 'create', volume])).code, 0);
  created = true;
  const runtime = [
    'run',
    '--rm',
    '-i',
    '--mount',
    `source=${volume},target=/home/node/.n8n`,
    '-e',
    'N8N_DIAGNOSTICS_ENABLED=false',
    image,
  ];
  const imported = await docker(
    [...runtime, 'import:workflow', '--input=/dev/stdin'],
    JSON.stringify(workflows),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const results = [];
  for (const sample of cases) {
    const output = await docker([
      ...runtime,
      'execute',
      '--id=' + sample.id,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const data = execution.data.resultData;
    await writeFile(
      new URL(`${sample.id}-execution.json`, directory),
      JSON.stringify(execution, null, 2),
    );
    if (sample.error) {
      assert.equal(
        execution.status,
        'error',
        `${sample.id}: ${JSON.stringify(data)}`,
      );
      assert.ok(
        JSON.stringify(data.error).includes(sample.error),
        `${sample.id}: ${JSON.stringify(data.error)}`,
      );
      assert.equal(
        observed.get(sample.id).length,
        sample.expectedRequests,
        sample.id,
      );
    } else {
      assert.equal(
        execution.status,
        'success',
        `${sample.id}: ${JSON.stringify(data.error)}`,
      );
      const pages = data.runData['Request pages'][0].data.main[0];
      assert.equal(pages.length, sample.expectedPages, sample.id);
      assert.equal(
        observed.get(sample.id).length,
        sample.expectedPages,
        sample.id,
      );
      assert.equal(pages[0].json.body, '42');
      if (sample.method)
        assert.deepEqual(
          wireBodies.get(sample.id),
          Array.from({ length: 3 }, () => '{"label":"42"}'),
        );
      if (['status-stop', 'status-stop-multiple'].includes(sample.id)) {
        assert.deepEqual(
          pages.map((item) => item.json.statusCode),
          sample.multi ? [200, 204, 200, 204] : [200, 204],
        );
        for (const item of pages.filter((item) => item.json.statusCode === 204))
          assert.equal(Object.hasOwn(item.json, 'body'), false);
      } else
        assert.deepEqual(
          pages.map((item) => item.json.body),
          ['42', '{"unchanged":true}', ''],
        );
      const received = data.runData['Receive pages'][0].data.main[0];
      assert.deepEqual(
        received.map((item) => item.pairedItem),
        Array.from({ length: sample.expectedPages }, (_, index) => ({
          item: sample.multi ? Math.floor(index / 2) : 0,
        })),
      );
      assert.deepEqual(
        pages.map((item) => item.pairedItem),
        Array.from({ length: sample.expectedPages }, (_, item) => ({ item })),
      );
      for (const pairs of observed.get(sample.id)) {
        const query = new URLSearchParams(pairs);
        assert.equal(
          query.get('filter'),
          sample.bound ? 'bound filter &/' : 'A B&/',
        );
        if (!sample.next) assert.equal(query.getAll('page').length, 1);
      }
      if (sample.multi)
        assert.deepEqual(
          observed
            .get(sample.id)
            .map((pairs) => new URLSearchParams(pairs).get('page'))
            .sort(),
          ['1', '1', '2', '2'],
        );
      else
        assert.deepEqual(
          observed
            .get(sample.id)
            .map((pairs) => new URLSearchParams(pairs).get('page')),
          Array.from({ length: sample.expectedPages }, (_, index) =>
            String(index + 1),
          ),
        );
    }
    results.push({
      case: sample.id,
      status: 'passed',
      execution: execution.status,
      requests: observed.get(sample.id).length,
    });
    console.log(JSON.stringify(results.at(-1)));
  }
  const report = {
    image,
    sdk: '0.36.4',
    httpRequestNode: '4.3',
    target: 'isolated-local-contract-server',
    modelCalls: 0,
    businessServiceCalls: 0,
    output:
      'per-page response envelopes; no collection schema or model planning integration',
    unsupported: [
      'nextURL',
      'body parameter updates',
      'body page metadata termination',
      'empty-body termination',
    ],
    results,
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (created) assert.equal((await docker(['volume', 'rm', volume])).code, 0);
}
