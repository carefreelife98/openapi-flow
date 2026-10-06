import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import console from 'node:console';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';
import {
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
  createN8nNativeCapabilities,
} from '@openapi-flow/n8n';
import {
  graphMaterials,
  graphPlan,
  names,
} from '../test/fixtures/request-binding-fixture.mjs';

const volume = `openapi-flow-request-bindings-${process.pid}-${Date.now()}`;
const image = 'n8nio/n8n:2.37.10';
const requests = [];
const failures = [];
let source;
function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [],
      errors = [];
    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (exitCode) =>
      resolve({
        exitCode,
        stdout: Buffer.concat(output).toString(),
        stderr: Buffer.concat(errors).toString(),
      }),
    );
    child.stdin.end(input);
  });
}
const runtimeArgs = [
  'run',
  '--rm',
  '-i',
  '--mount',
  `source=${volume},target=/home/node/.n8n`,
  '-e',
  'N8N_DIAGNOSTICS_ENABLED=false',
  image,
];
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://fixture.local');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    requests.push({
      path: url.pathname,
      query: [...url.searchParams],
      body: text ? JSON.parse(text) : undefined,
    });
    let body;
    if (url.pathname === '/source') body = source;
    else if (url.pathname.startsWith('/detail/')) {
      assert.equal(decodeURIComponent(url.pathname.slice(8)), source.id);
      body = { id: source.id };
    } else if (url.pathname === '/price') {
      assert.equal(url.searchParams.get('id'), source.id);
      assert.equal(url.searchParams.get('labels'), source.labels.join('|'));
      assert.equal(url.searchParams.get('filter[R]'), String(source.filter.R));
      body = { price: 12.5 };
    } else if (url.pathname === '/stock') {
      assert.equal(url.searchParams.get('id'), source.id);
      body = { stock: 0 };
    } else if (url.pathname === '/summary') {
      body = JSON.parse(text);
      assert.deepEqual(body, {
        id: source.id,
        price: 12.5,
        stock: 0,
        labels: source.labels,
        filter: source.filter,
      });
    } else throw new Error('Unexpected fixture route ' + url.pathname);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  } catch (error) {
    failures.push(error.message);
    response.writeHead(422);
    response.end(JSON.stringify({ error: error.message }));
  }
});
let volumeCreated = false;
try {
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const result = compilePlannedN8nWorkflow({
    id: 'request-binding-dag',
    name: 'Request binding DAG',
    plan: graphPlan,
    materials: graphMaterials,
    capabilities: createN8nNativeCapabilities(),
    apiNodes: [...graphMaterials].reverse().map((material) =>
      createHttpRequestNode({
        ...material,
        baseUrl,
        credentialBindings: {},
        apiNodeNames: names,
        position: [300, 0],
      }),
    ),
  });
  const directory = new URL(
    '../.local-artifacts/request-bindings/',
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('workflow.json', directory),
    JSON.stringify(result.workflow, null, 2),
  );
  assert.equal((await docker(['volume', 'create', volume])).exitCode, 0);
  volumeCreated = true;
  const imported = await docker(
    [...runtimeArgs, 'import:workflow', '--input=/dev/stdin'],
    JSON.stringify(result.workflow),
  );
  assert.equal(imported.exitCode, 0, imported.stderr + imported.stdout);
  const results = [];
  for (const mode of [
    'first-runtime-id',
    'changed-runtime-id',
    'missing-source-id',
    'wrong-source-type',
  ]) {
    const id = randomUUID();
    source = { id, labels: ['runtime a', 'b'], filter: { R: 2 } };
    if (mode === 'missing-source-id') delete source.id;
    if (mode === 'wrong-source-type') source.id = 42;
    const offset = requests.length;
    const output = await docker([
      ...runtimeArgs,
      'execute',
      '--id=request-binding-dag',
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    await writeFile(
      new URL(`${mode}.execution.json`, directory),
      JSON.stringify(
        {
          status: execution.status,
          executedNodes: Object.keys(execution.data.resultData.runData),
        },
        null,
        2,
      ),
    );
    const calls = requests.slice(offset);
    if (mode.endsWith('runtime-id')) {
      assert.equal(
        output.exitCode,
        0,
        'isolated n8n request binding execution failed',
      );
      assert.equal(calls.length, 5);
      assert.equal(calls[0].path, '/source');
      assert.equal(calls.at(-1).path, '/summary');
    } else {
      assert.notEqual(output.exitCode, 0);
      assert.equal(calls.length, 1);
    }
    assert.deepEqual(failures, []);
    results.push({ mode, exitCode: output.exitCode, source, requests: calls });
    console.log(`${mode}: PASSED (${calls.length} requests)`);
  }
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(
      {
        image,
        results,
        target: 'isolated-local-fixture',
        planner: 'deterministic-public-fixture-no-LLM',
        actualConcurrencyGuaranteed: false,
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (volumeCreated) {
    const removed = await docker(['volume', 'rm', volume]);
    assert.equal(removed.exitCode, 0, removed.stderr);
  }
}
