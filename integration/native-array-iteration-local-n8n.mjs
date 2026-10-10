import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';
import {
  context,
  contextSchema,
  referencedContextSchema,
  compileNativeIteration,
} from '../test/fixtures/native-array-iteration-fixture.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-native-array-${process.pid}-${Date.now()}`;
let mode = 'normal';
let scenarioValue;
const calls = [],
  failures = [];
function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [],
      err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({
        code,
        stdout: Buffer.concat(out).toString(),
        stderr: Buffer.concat(err).toString(),
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
    const body = JSON.parse(Buffer.concat(chunks).toString());
    calls.push({ path: url.pathname, body });
    assert.ok(scenarioValue, 'the current scenario must be configured');
    if (url.pathname === '/parent')
      assert.ok(
        scenarioValue.groups.some(
          (group) => JSON.stringify(group) === JSON.stringify(body),
        ),
      );
    else if (['/left', '/right'].includes(url.pathname))
      assert.ok(
        scenarioValue.groups
          .flatMap((group) => group.children)
          .some((child) => JSON.stringify(child) === JSON.stringify(body)),
      );
    else if (url.pathname === '/combine') {
      assert.deepEqual(body.left, body.right);
      assert.ok(
        body.parent.children.some(
          (child) => JSON.stringify(child) === JSON.stringify(body.left),
        ),
      );
    } else if (url.pathname === '/submit') {
      assert.ok(Array.isArray(body));
    } else throw Error('Unexpected local route');
    let result = body;
    if (mode === 'invalid-branch' && url.pathname === '/left')
      result = { ...body, amount: '8' };
    if (mode === 'invalid-follow-up' && url.pathname === '/combine')
      result = { ...body, parent: { ...body.parent, marker: 42 } };
    response.writeHead(200, {
      'content-type':
        mode === 'wrong-media' && url.pathname === '/left'
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
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const cases = [
    'normal',
    'empty-parents',
    'empty-children',
    'one-child',
    'invalid-native-sibling',
    'invalid-native-item',
    'invalid-native-missing',
    'invalid-branch',
    'invalid-follow-up',
    'wrong-media',
  ];
  const fixtures = cases.flatMap((name) =>
    ['inline', 'references'].map((variant) => {
      const value = globalThis.structuredClone(context);
      if (name === 'empty-parents') value.groups = [];
      if (name === 'empty-children')
        value.groups.forEach((group) => {
          group.children = [];
        });
      if (name === 'one-child')
        value.groups = [
          { ...context.groups[0], children: [context.groups[0].children[0]] },
        ];
      const workflow = compileNativeIteration(
        baseUrl,
        value,
        variant === 'references' ? referencedContextSchema : contextSchema,
      ).workflow;
      workflow.id = 'native-array-' + variant + '-' + name;
      if (name.startsWith('invalid-native-')) {
        // Deliberate fault injection after valid compilation; never repair producer data.
        const corrupt = globalThis.structuredClone(context);
        if (name === 'invalid-native-sibling') corrupt.marker = 'changed';
        if (name === 'invalid-native-item')
          corrupt.groups[0].children[0].amount = '8';
        if (name === 'invalid-native-missing') delete corrupt.groups;
        workflow.nodes.find(
          (node) => node.id === 'context',
        ).parameters.jsonOutput = JSON.stringify(corrupt);
      }
      return { name, variant, value, workflow };
    }),
  );
  const directory = new URL(
    '../.local-artifacts/native-array-iteration/',
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('five-api-workflow.json', directory),
    JSON.stringify(fixtures[0].workflow, null, 2),
  );
  await writeFile(
    new URL('five-api-references-workflow.json', directory),
    JSON.stringify(fixtures[1].workflow, null, 2),
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
  for (const fixture of fixtures) {
    mode = fixture.name;
    scenarioValue = fixture.value;
    const offset = calls.length;
    const execution = readN8nExecution(
      (
        await docker([
          ...runtime,
          'execute',
          '--id=' + fixture.workflow.id,
          '--rawOutput',
        ])
      ).stdout,
    );
    const received = calls.slice(offset),
      data = execution.data.resultData;
    if (mode.startsWith('invalid-native-')) {
      assert.equal(execution.status, 'error');
      assert.equal(received.length, 0);
      assert.equal(data.lastNodeExecuted, 'Read array each-parent');
      assert.match(
        data.error.stack,
        /^Error: Native output does not match declared schema: /,
      );
    } else if (
      ['invalid-branch', 'invalid-follow-up', 'wrong-media'].includes(mode)
    ) {
      assert.equal(execution.status, 'error');
      assert.equal(
        received.filter((call) => call.path === '/submit').length,
        0,
      );
      assert.match(
        data.error.stack,
        /^Error: Response (left|combine) does not match its OAS contract: /,
      );
      if (mode !== 'invalid-follow-up')
        assert.equal(
          received.filter((call) => call.path === '/combine').length,
          0,
        );
    } else {
      assert.equal(execution.status, 'success', JSON.stringify(data.error));
      const children = fixture.value.groups.flatMap((group) => group.children);
      assert.equal(
        received.length,
        fixture.value.groups.length +
          children.length * 3 +
          (children.length ? 1 : 0),
      );
      const split = data.runData['each-child']?.[0].data.main[0];
      if (children.length) {
        assert.deepEqual(
          split.map((item) => item.json.item),
          children,
        );
        for (const item of split) {
          const wrapper =
            data.runData['Read array each-child'][0].data.main[0][
              item.pairedItem.item
            ];
          const parentIndex = wrapper.pairedItem.item;
          assert.ok(
            fixture.value.groups[parentIndex].children.some(
              (child) =>
                JSON.stringify(child) === JSON.stringify(item.json.item),
            ),
          );
        }
        const expected = fixture.value.groups.flatMap((parent) =>
          parent.children.map((child) => ({
            left: child,
            right: child,
            parent,
          })),
        );
        assert.deepEqual(
          received.find((call) => call.path === '/submit').body,
          expected,
        );
        assert.equal(
          received.filter((call) => call.path === '/submit').length,
          1,
        );
      } else {
        assert.equal(
          received.filter((call) => call.path === '/submit').length,
          0,
        );
        assert.equal(data.runData['Request submit'], undefined);
      }
    }
    assert.deepEqual(failures, []);
    results.push({
      mode,
      variant: fixture.variant,
      status: 'passed',
      execution: execution.status,
      requests: received.length,
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
