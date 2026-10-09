import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import {
  createItemJoinFixture,
  rows,
} from '../test/fixtures/item-join-fixture.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-item-join-${process.pid}-${Date.now()}`;
const cases = [
  { mode: 'reordered', branches: 2 },
  { mode: 'reordered', branches: 3 },
  { mode: 'empty', branches: 2 },
  { mode: 'both-filtered', branches: 2 },
  { mode: 'missing', branches: 2 },
  { mode: 'empty-branch', branches: 2 },
  { mode: 'duplicate', branches: 2 },
  { mode: 'ambiguous', branches: 2 },
  { mode: 'invalid-response', branches: 2 },
];
let mode;
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
    if (url.pathname === '/records')
      result = { records: mode === 'empty' ? [] : rows };
    else if (['/alpha', '/beta', '/gamma'].includes(url.pathname)) {
      assert.ok(
        rows.some((row) => JSON.stringify(row) === JSON.stringify(body)),
      );
      result = { branch: url.pathname.slice(1), item: body };
      if (mode === 'invalid-response' && url.pathname === '/beta')
        result.item.amount = '8';
    } else if (url.pathname.startsWith('/consume/')) {
      const values = Object.values(body);
      assert.ok(values.length >= 2);
      for (const [id, value] of Object.entries(body)) {
        assert.equal(value.branch, id);
        assert.deepEqual(value.item, body.alpha.item);
      }
      assert.equal(
        decodeURIComponent(url.pathname.slice('/consume/'.length)),
        String(body.alpha.item.amount),
      );
      assert.equal(url.searchParams.get('id'), body.alpha.item.id);
      result = { accepted: true };
    } else throw Error('Unexpected local route');
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
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const fixtures = [];
  for (const sample of cases)
    fixtures.push(
      await createItemJoinFixture(baseUrl, sample.mode, sample.branches),
    );
  const directory = new URL('../.local-artifacts/item-join/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const [file, fixture] of [
    ['workflow.json', fixtures[0]],
    ['five-api-workflow.json', fixtures[1]],
  ])
    await writeFile(
      new URL(file, directory),
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
    JSON.stringify(fixtures.map((fixture) => fixture.workflow)),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const results = [];
  for (const [index, sample] of cases.entries()) {
    mode = sample.mode;
    const offset = calls.length;
    const output = await docker([
      ...runtime,
      'execute',
      '--id=' + fixtures[index].workflow.id,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const received = calls.slice(offset);
    const consumed = received.filter((call) =>
      call.path.startsWith('/consume/'),
    );
    const failureCase = [
      'missing',
      'empty-branch',
      'duplicate',
      'ambiguous',
      'invalid-response',
    ].includes(mode);
    assert.equal(
      execution.status,
      failureCase ? 'error' : 'success',
      JSON.stringify(execution.data.resultData.error),
    );
    if (failureCase) {
      assert.equal(consumed.length, 0);
      if (mode === 'missing' || mode === 'empty-branch')
        assert.match(
          execution.data.resultData.error.message,
          /missing response beta/,
        );
      if (mode === 'duplicate')
        assert.match(
          execution.data.resultData.error.message,
          /duplicate response beta/,
        );
    } else if (mode === 'empty') {
      assert.equal(received.length, 1);
      assert.equal(execution.data.resultData.runData.joined, undefined);
    } else {
      const joined = execution.data.resultData.runData.joined[0].data.main[0];
      const expected = mode === 'both-filtered' ? [rows[0], rows[2]] : rows;
      assert.equal(joined.length, expected.length);
      assert.equal(consumed.length, expected.length);
      assert.deepEqual(
        joined.map((item) => item.json.responses.alpha.item),
        expected,
      );
      for (const item of joined) {
        assert.equal(item.pairedItem.length, sample.branches);
        for (const value of Object.values(item.json.responses))
          assert.deepEqual(value.item, item.json.responses.alpha.item);
      }
    }
    assert.deepEqual(serverErrors, []);
    results.push({
      mode,
      branches: sample.branches,
      status: 'passed',
      execution: execution.status,
      requests: received.length,
      consumed: consumed.length,
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
