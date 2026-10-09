import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import {
  parents,
  childrenFor,
  compileNestedIteration,
} from '../test/fixtures/nested-array-iteration-fixture.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-nested-array-${process.pid}-${Date.now()}`;
const calls = [];
const failures = [];
let mode = 'normal';
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
const receiptFor = (parent) => parent.id + ':' + parent.amount;
const expectedLeaves = (rows) =>
  rows.flatMap((parent) =>
    childrenFor(parent).map((child) => ({
      parent,
      child,
      receipt: receiptFor(parent),
    })),
  );
const sorted = (values) => values.map((value) => JSON.stringify(value)).sort();
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://fixture.local').pathname;
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : undefined;
    calls.push({ path, body });
    let result;
    if (path === '/parents')
      result = { parents: mode === 'empty-parents' ? [] : parents };
    else if (path === '/children') {
      assert.ok(
        parents.some(
          (parent) => JSON.stringify(parent) === JSON.stringify(body),
        ),
      );
      result = {
        receipt: receiptFor(body),
        parent: body,
        children: mode === 'empty-children' ? [] : childrenFor(body),
      };
      if (body.amount === 5) {
        if (mode === 'invalid-array') result.children = null;
        if (mode === 'invalid-element') result.children[0].amount = '5';
      }
    } else if (['/inspect', '/confirm', '/audit'].includes(path)) {
      assert.ok(
        expectedLeaves(parents).some(
          (leaf) => JSON.stringify(leaf) === JSON.stringify(body),
        ),
        'Leaf must contain its original parent, child and receipt',
      );
      result = body;
      if (path === '/inspect' && mode === 'invalid-leaf-response')
        result = { ...body, receipt: 42 };
    } else throw Error('Unexpected local route ' + path);
    response.writeHead(200, {
      'content-type':
        mode === 'wrong-media' && path === '/children'
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
  const { workflow } = compileNestedIteration(
    `http://host.docker.internal:${server.address().port}`,
  );
  const filtered = compileNestedIteration(
    `http://host.docker.internal:${server.address().port}`,
    true,
  ).workflow;
  const directory = new URL(
    '../.local-artifacts/nested-array-iteration/',
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('workflow.json', directory),
    JSON.stringify(workflow, null, 2),
  );
  await writeFile(
    new URL('filtered-workflow.json', directory),
    JSON.stringify(filtered, null, 2),
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
    JSON.stringify([workflow, filtered]),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const results = [];
  for (const sample of [
    'normal',
    'filtered',
    'empty-parents',
    'empty-children',
    'invalid-array',
    'invalid-element',
    'wrong-media',
    'invalid-leaf-response',
  ]) {
    mode = sample;
    const offset = calls.length;
    const output = await docker([
      ...runtime,
      'execute',
      '--id=' + (mode === 'filtered' ? filtered.id : workflow.id),
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const received = calls.slice(offset);
    const data = execution.data.resultData;
    if (mode === 'normal') {
      assert.equal(execution.status, 'success', JSON.stringify(data.error));
      assert.equal(received.length, 19);
      for (const path of ['/inspect', '/confirm', '/audit'])
        assert.deepEqual(
          sorted(
            received
              .filter((call) => call.path === path)
              .map((call) => call.body),
          ),
          sorted(expectedLeaves(parents)),
        );
      const childReaders =
        data.runData['Read array each-child'][0].data.main[0];
      const splitChildren = data.runData['each-child'][0].data.main[0];
      const materialized = data.runData['Materialize inspect'][0].data.main[0];
      const childResponses = data.runData['Request children'][0].data.main[0];
      assert.deepEqual(
        childReaders.map((item) => item.json.items.length),
        [2, 0, 3],
      );
      assert.deepEqual(
        splitChildren.map((item) => item.pairedItem.item),
        [0, 0, 2, 2, 2],
      );
      materialized.forEach((item, index) => {
        assert.equal(item.pairedItem.item, index);
        const child = splitChildren[index];
        const parentIndex = childReaders[child.pairedItem.item].pairedItem.item;
        const source = childResponses[parentIndex].json.body;
        assert.deepEqual(JSON.parse(item.json.body.value), {
          parent: source.parent,
          child: child.json.item,
          receipt: source.receipt,
        });
      });
      const checked = data.runData['verify-ancestry'][0].data.main[0];
      assert.equal(checked.length, 5);
      assert.ok(checked.every((item) => item.json.pass === true));
    } else if (mode === 'filtered') {
      assert.equal(execution.status, 'success', JSON.stringify(data.error));
      assert.equal(received.length, 13);
      const selected = parents.filter((parent) => parent.amount < 6);
      for (const path of ['/inspect', '/confirm', '/audit'])
        assert.deepEqual(
          sorted(
            received
              .filter((call) => call.path === path)
              .map((call) => call.body),
          ),
          sorted(expectedLeaves(selected)),
        );
      const readers = data.runData['Read array each-child'][0].data.main[0];
      assert.deepEqual(
        readers.map((item) => item.json.items.length),
        [0, 3],
      );
      const children = data.runData['each-child'][0].data.main[0];
      assert.deepEqual(
        children.map((item) => item.pairedItem.item),
        [1, 1, 1],
      );
      assert.ok(
        data.runData['verify-ancestry'][0].data.main[0].every(
          (item) => item.json.pass === true,
        ),
      );
    } else if (mode.startsWith('empty-')) {
      assert.equal(execution.status, 'success', JSON.stringify(data.error));
      assert.equal(received.length, mode === 'empty-parents' ? 1 : 4);
      assert.equal(data.runData['Request inspect'], undefined);
    } else {
      assert.equal(execution.status, 'error');
      assert.equal(
        data.lastNodeExecuted,
        mode === 'invalid-leaf-response'
          ? 'Materialize confirm'
          : 'Read array each-child',
      );
      assert.equal(
        received.filter(
          (call) => call.path === '/confirm' || call.path === '/audit',
        ).length,
        0,
      );
      if (mode !== 'invalid-leaf-response')
        assert.equal(
          received.filter((call) => call.path === '/inspect').length,
          0,
        );
    }
    assert.deepEqual(failures, []);
    results.push({
      mode,
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
