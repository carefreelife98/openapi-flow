import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import {
  compileIteration,
  compileConditionalIteration,
  compileCollectedIteration,
} from '../test/fixtures/array-iteration-fixture.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-array-iteration-${process.pid}-${Date.now()}`;
const rows = [
  { id: 'same/42', amount: 8 },
  { id: 'other', amount: 2 },
  { id: 'same/42', amount: 5 },
];
let mode = 'normal';
let caseOffset = 0;
const calls = [];
const failures = [];
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
    if (url.pathname === '/records')
      result = {
        records:
          mode === 'empty'
            ? []
            : mode === 'invalid-source'
              ? [{ id: 'x', amount: '8' }]
              : rows,
      };
    else if (url.pathname === '/details') {
      assert.ok(
        rows.some((row) => row.id === body.id && row.amount === body.amount),
      );
      result = { receipt: `${body.id}:${body.amount}`, input: body };
      if (mode === 'invalid-response') result.receipt = 42;
    } else if (url.pathname.startsWith('/confirm/')) {
      assert.ok(
        rows.some((row) => row.id === body.id && row.amount === body.amount),
      );
      assert.equal(
        decodeURIComponent(url.pathname.slice('/confirm/'.length)),
        `${body.id}:${body.amount}`,
      );
      result = body;
    } else if (url.pathname === '/submit') {
      assert.ok(Array.isArray(body));
      assert.deepEqual(
        [...body].sort((a, b) => a.amount - b.amount),
        calls
          .slice(caseOffset)
          .filter((call) => call.path.startsWith('/confirm/'))
          .map((call) => call.body)
          .sort((a, b) => a.amount - b.amount),
      );
      result = { accepted: body.length };
    } else throw Error('Unexpected local route');
    response.writeHead(200, {
      'content-type':
        mode === 'wrong-media' && url.pathname === '/records'
          ? 'text/plain'
          : 'application/json',
    });
    response.end(JSON.stringify(result));
  } catch (error) {
    failures.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end('{}');
  }
});
let created = false;
try {
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const result = compileIteration(
    `http://host.docker.internal:${server.address().port}`,
  );
  const directory = new URL(
    '../.local-artifacts/array-iteration/',
    import.meta.url,
  );
  const conditional = compileConditionalIteration(
    `http://host.docker.internal:${server.address().port}`,
  );
  const collection = compileCollectedIteration(
    `http://host.docker.internal:${server.address().port}`,
  );
  const conditionalCollection = compileCollectedIteration(
    `http://host.docker.internal:${server.address().port}`,
    true,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('workflow.json', directory),
    JSON.stringify(result.workflow, null, 2),
  );
  assert.equal((await docker(['volume', 'create', volume])).code, 0);
  await writeFile(
    new URL('conditional-workflow.json', directory),
    JSON.stringify(conditional.workflow, null, 2),
  );
  created = true;
  for (const [file, workflow] of [
    ['collection-workflow.json', collection.workflow],
    ['conditional-collection-workflow.json', conditionalCollection.workflow],
  ])
    await writeFile(
      new URL(file, directory),
      JSON.stringify(workflow, null, 2),
    );
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
    JSON.stringify([
      result.workflow,
      conditional.workflow,
      collection.workflow,
      conditionalCollection.workflow,
    ]),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const results = [];
  const cases = [
    ...[
      'normal',
      'empty',
      'invalid-source',
      'invalid-response',
      'wrong-media',
    ].map((name) => ({ name, mode: name, workflowId: 'array-iteration' })),
    {
      name: 'conditional',
      mode: 'conditional',
      workflowId: 'array-conditional',
    },
    { name: 'collection', mode: 'collection', workflowId: 'array-collection' },
    {
      name: 'conditional-collection',
      mode: 'conditional-collection',
      workflowId: 'array-conditional-collection',
    },
    { name: 'empty-collection', mode: 'empty', workflowId: 'array-collection' },
  ];
  for (const sample of cases) {
    mode = sample.mode;
    const offset = calls.length;
    caseOffset = offset;
    const output = await docker([
      ...runtime,
      'execute',
      '--id=' + sample.workflowId,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const received = calls.slice(offset);
    if (mode === 'collection' || mode === 'conditional-collection') {
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      assert.equal(received.length, mode === 'collection' ? 8 : 7);
      const collected =
        execution.data.resultData.runData['collected-results'][0].data.main[0];
      assert.equal(collected.length, 1);
      assert.deepEqual(
        collected[0].json.items,
        execution.data.resultData.runData[
          'Request confirm'
        ][0].data.main[0].map((item) => item.json.body),
      );
      assert.equal(
        received.filter((call) => call.path === '/submit').length,
        1,
      );
      assert.deepEqual(
        received.find((call) => call.path === '/submit').body,
        collected[0].json.items,
      );
    } else if (mode === 'normal') {
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      assert.equal(received.length, 7);
      for (const path of ['/details', '/confirm/'])
        assert.deepEqual(
          received
            .filter((call) => call.path.startsWith(path))
            .map((call) => call.body)
            .sort((a, b) => a.amount - b.amount),
          [...rows].sort((a, b) => a.amount - b.amount),
        );
      assert.equal(
        execution.data.resultData.runData['Request confirm'][0].data.main[0]
          .length,
        3,
      );
      const checked =
        execution.data.resultData.runData['verify-item'][0].data.main[0];
      assert.equal(checked.length, 3);
      assert.ok(checked.every((item) => item.json.pass === true));
    } else if (mode === 'conditional') {
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      assert.equal(received.length, 6);
      assert.deepEqual(
        received
          .filter((call) => call.path.startsWith('/confirm/'))
          .map((call) => call.body)
          .sort((a, b) => a.amount - b.amount),
        rows
          .filter((row) => row.amount > 3)
          .sort((a, b) => a.amount - b.amount),
      );
      const checked =
        execution.data.resultData.runData['verify-item'][0].data.main[0];
      assert.equal(checked.length, 2);
      assert.ok(checked.every((item) => item.json.pass === true));
    } else if (mode === 'empty') {
      assert.equal(execution.status, 'success');
      assert.equal(received.length, 1);
      if (sample.name === 'empty-collection') {
        assert.equal(
          execution.data.resultData.runData['collected-results'],
          undefined,
        );
        assert.equal(
          execution.data.resultData.runData['Request submit'],
          undefined,
        );
      }
    } else {
      assert.equal(execution.status, 'error');
      assert.equal(
        received.filter((call) => call.path.startsWith('/confirm/')).length,
        0,
      );
      if (mode !== 'invalid-response') assert.equal(received.length, 1);
    }
    assert.deepEqual(failures, []);
    results.push({
      mode: sample.name,
      status: 'passed',
      execution: execution.status,
      requests: received.length,
    });
  }
  const report = {
    image,
    target: 'isolated-local-contract-server',
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
