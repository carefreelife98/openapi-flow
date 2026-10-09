import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import {
  createSchemaProjectionFixture,
  projectionRows,
} from '../test/fixtures/schema-projection-fixture.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-schema-projection-${process.pid}-${Date.now()}`;
const cases = [
  {
    name: 'nullable-null',
    kind: 'nullable',
    body: { amount: null },
    expected: [[null]],
  },
  {
    name: 'nullable-positive',
    kind: 'nullable',
    body: { amount: 2 },
    expected: [[2]],
  },
  { name: 'nullable-zero', kind: 'nullable', body: { amount: 0 }, error: true },
  {
    name: 'nullable-wrong-type',
    kind: 'nullable',
    body: { amount: '2' },
    error: true,
  },
  {
    name: 'composite-normal',
    kind: 'composite',
    body: { records: projectionRows },
    expected: projectionRows,
  },
  {
    name: 'composite-upper',
    kind: 'composite',
    body: { records: [{ amount: 6 }] },
    error: true,
  },
  {
    name: 'composite-lower',
    kind: 'composite',
    body: { records: [{ amount: 1 }] },
    error: true,
  },
  {
    name: 'composite-empty',
    kind: 'composite',
    body: { records: [] },
    expected: [],
  },
];
let sample;
const calls = [],
  serverErrors = [];
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
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://fixture.local');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : undefined;
    calls.push({ path: url.pathname, body });
    let result;
    if (url.pathname === '/source') result = sample.body;
    else if (url.pathname === '/sink') {
      assert.ok(
        sample.expected.some(
          (value) => JSON.stringify(value) === JSON.stringify(body),
        ),
      );
      result = { accepted: true };
    } else throw new Error('Unexpected local route');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(result));
  } catch (error) {
    serverErrors.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end('{}');
  }
});
let created = false;
try {
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const fixtures = Object.fromEntries(
    await Promise.all(
      ['nullable', 'composite'].map(async (kind) => [
        kind,
        await createSchemaProjectionFixture(
          `http://host.docker.internal:${server.address().port}`,
          kind,
        ),
      ]),
    ),
  );
  const directory = new URL(
    '../.local-artifacts/schema-projection/',
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  for (const [kind, fixture] of Object.entries(fixtures))
    await writeFile(
      new URL(kind + '-workflow.json', directory),
      JSON.stringify(fixture.workflow, null, 2),
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
    JSON.stringify(Object.values(fixtures).map((fixture) => fixture.workflow)),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const results = [];
  for (sample of cases) {
    const before = globalThis.structuredClone(sample.body);
    const offset = calls.length;
    const output = await docker([
      ...runtime,
      'execute',
      '--id=' + fixtures[sample.kind].workflow.id,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const received = calls.slice(offset);
    const sinks = received
      .filter((call) => call.path === '/sink')
      .map((call) => call.body);
    assert.equal(
      execution.status,
      sample.error ? 'error' : 'success',
      JSON.stringify(execution.data.resultData.error),
    );
    if (sample.error) {
      assert.deepEqual(sinks, []);
      assert.equal(received.length, 1);
      assert.equal(
        execution.data.resultData.lastNodeExecuted,
        sample.kind === 'nullable'
          ? 'Read values projected'
          : 'Read array projected',
      );
    } else {
      assert.equal(sinks.length, sample.expected.length);
      for (const value of sample.expected)
        assert.ok(
          sinks.some((body) => JSON.stringify(body) === JSON.stringify(value)),
        );
    }
    assert.deepEqual(sample.body, before);
    assert.deepEqual(serverErrors, []);
    results.push({
      name: sample.name,
      status: 'passed',
      execution: execution.status,
      sourceRequests: received.length - sinks.length,
      sinkRequests: sinks.length,
    });
  }
  const report = {
    image,
    target: 'isolated-local-contract-server',
    planner: 'deterministic-fixture-no-LLM',
    businessServiceCalls: 0,
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
