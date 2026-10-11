import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { node } from '@n8n/workflow-sdk';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-http-decoding-${process.pid}-${Date.now()}`;
const cases = [
  {
    id: 'json-suffix',
    media: 'application/problem+json',
    raw: '"상품 😀"',
    expectedBody: '상품 😀',
  },
  {
    id: 'text-not-json',
    media: 'text/plain; charset=utf-8',
    raw: '42',
    expectedBody: '42',
  },
  { id: 'empty-text', media: 'text/plain', raw: '', expectedBody: '' },
  {
    id: 'text-charset',
    media: 'text/plain; charset=windows-1252',
    raw: Buffer.from([0xe9]),
    expectedBody: 'é',
  },
  {
    id: 'binary',
    media: 'application/octet-stream',
    raw: Buffer.from([0, 255, 42]),
    expectedBytes: [0, 255, 42],
  },
  {
    id: 'empty-binary',
    media: 'application/octet-stream',
    raw: '',
    expectedBytes: [],
  },
  {
    id: 'no-content',
    media: 'application/json',
    raw: '',
    status: 204,
    noBody: true,
  },
  {
    id: 'head',
    media: 'application/json',
    raw: '',
    method: 'HEAD',
    noBody: true,
  },
  {
    id: 'invalid-json',
    media: 'application/json',
    raw: '{',
    error: 'invalid JSON HTTP response',
    lastNode: 'Request source',
  },
  {
    id: 'empty-json',
    media: 'application/json',
    raw: '',
    error: 'invalid JSON HTTP response',
    lastNode: 'Request source',
  },
  {
    id: 'invalid-utf8',
    media: 'application/json',
    raw: Buffer.from([0x22, 0xff, 0x22]),
    error: 'invalid HTTP response encoding',
    lastNode: 'Request source',
  },
  {
    id: 'non-success-status',
    media: 'application/json',
    raw: '{"unavailable":true}',
    status: 503,
    lastNode: 'Receive source',
  },
];
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
const server = createServer((request, response) => {
  const sample = cases.find((entry) => request.url === '/' + entry.id);
  if (!sample) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(sample.status ?? 200, {
    'content-type': sample.media,
    'x-response-test': sample.id,
  });
  response.end(sample.raw);
});
let created = false;
try {
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const workflows = [];
  for (const sample of cases) {
    const catalog = await createApiCatalog([
      {
        id: sample.id,
        spec: {
          openapi: '3.1.0',
          info: { title: 'Raw HTTP response', version: '1' },
          paths: {
            ['/' + sample.id]: {
              [(sample.method ?? 'GET').toLowerCase()]: {
                responses: {
                  [sample.status ?? 200]: {
                    description: 'Transport response',
                    ...(!sample.noBody
                      ? {
                          content: {
                            [sample.media.split(';')[0]]: { schema: true },
                          },
                        }
                      : {}),
                  },
                },
              },
            },
          },
        },
      },
    ]);
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    const api = createHttpRequestNode({
      operation,
      arguments: {
        callId: 'source',
        values: {},
        bindings: [],
        unresolvedInputs: [],
      },
      baseUrl,
      position: [300, 0],
    });
    const inspect = node({
      type: 'n8n-nodes-base.code',
      version: 2,
      config: {
        id: 'inspect',
        name: 'Inspect response',
        position: [960, 0],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode:
            "const result=[];for(const [i,item] of $input.all().entries()){const binaryKeys=Object.keys(item.binary??{});result.push({json:{envelope:item.json,binaryKeys,...(binaryKeys.includes('data')?{bytes:Array.from(await this.helpers.getBinaryDataBuffer(i,'data'))}:{})},pairedItem:{item:i}});}return result;",
        },
      },
    });
    workflows.push(
      assembleN8nWorkflow({
        id: sample.id,
        name: 'HTTP decoding ' + sample.id,
        nodes: [
          api,
          {
            nodeId: 'inspect',
            nodes: [inspect],
            entry: inspect,
            exit: inspect,
            inputPorts: { main: 0 },
            outputPorts: { main: 0 },
          },
        ],
        starts: ['source'],
        edges: [
          { from: 'source', output: 'main', to: 'inspect', input: 'main' },
        ],
      }).workflow,
    );
  }
  const directory = new URL(
    '../.local-artifacts/http-response-decoding/',
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
    if (sample.lastNode) {
      assert.equal(execution.status, 'error');
      assert.equal(data.lastNodeExecuted, sample.lastNode);
      assert.equal(data.runData['Inspect response'], undefined);
      if (sample.error)
        assert.ok(JSON.stringify(data.error).includes(sample.error));
    } else {
      assert.equal(execution.status, 'success', JSON.stringify(data.error));
      const actual = data.runData['Inspect response'][0].data.main[0][0].json;
      assert.equal(actual.envelope.statusCode, sample.status ?? 200);
      assert.equal(actual.envelope.headers['content-type'], sample.media);
      assert.equal(actual.envelope.headers['x-response-test'], sample.id);
      assert.equal(actual.binaryKeys.includes('openApiFlowRawResponse'), false);
      if (Object.hasOwn(sample, 'expectedBody'))
        assert.deepEqual(actual.envelope.body, sample.expectedBody);
      else assert.equal(Object.hasOwn(actual.envelope, 'body'), false);
      if (sample.expectedBytes)
        assert.deepEqual(actual.bytes, sample.expectedBytes);
      else assert.deepEqual(actual.binaryKeys, []);
    }
    results.push({
      case: sample.id,
      status: 'passed',
      execution: execution.status,
      lastNode: data.lastNodeExecuted,
    });
  }
  const report = {
    image,
    target: 'isolated-local-contract-server',
    businessServiceCalls: 0,
    planner: 'deterministic-fixture-no-LLM',
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
