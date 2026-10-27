import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import console from 'node:console';
import { isDeepStrictEqual } from 'node:util';
import {
  compileMapEntryWorkflow,
  mapEntryBody,
  mapEntryItems,
  selectedGroup,
} from '../test/fixtures/api-response-map-entry-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

// Synthetic contracts only: no business services, user n8n instance or model calls.
const runId = randomUUID(),
  image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-map-entry-${runId}`;
const directory = new URL(
  `../.local-artifacts/api-response-map-entry/${runId}/`,
  import.meta.url,
);
const requests = [],
  serverErrors = [];
let current;
const server = createServer(async (request, response) => {
  try {
    assert.ok(current, 'An execution case is required');
    const url = new URL(request.url, 'http://fixture.local');
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const received = {
      path: url.pathname,
      method: request.method,
      ...(raw ? { body: JSON.parse(raw) } : {}),
    };
    requests.push(received);
    let result;
    if (url.pathname === '/groups') {
      assert.equal(request.method, 'GET');
      result = current.body;
    } else if (url.pathname === '/verify') {
      assert.equal(request.method, 'POST');
      assert.equal(received.body.group, current.key);
      assert.ok(
        current.body.result.items[current.key].some((item) =>
          isDeepStrictEqual(item, received.body.item),
        ),
      );
      result = received.body;
    } else throw new Error('Unexpected local fixture path');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(result));
  } catch (error) {
    serverErrors.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: error.message }));
  }
});
let created = false;
try {
  await mkdir(directory, { recursive: true });
  console.log(
    JSON.stringify({ status: 'started', directory: directory.pathname }),
  );
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const malformed = globalThis.structuredClone(mapEntryBody);
  malformed.result.items.other[0].gdNo = 7;
  const cases = [
    {
      name: 'literal-key',
      key: selectedGroup,
      body: mapEntryBody,
      expected: 'success',
    },
    {
      name: 'runtime-numeric-key',
      key: '0',
      runtimeKey: true,
      body: mapEntryBody,
      expected: 'success',
    },
    {
      name: 'runtime-empty-key-array',
      key: '',
      runtimeKey: true,
      body: mapEntryBody,
      expected: 'success',
    },
    {
      name: 'missing-own-key',
      key: 'missing',
      body: mapEntryBody,
      expected: 'error',
      message: /Missing own object key/,
    },
    {
      name: 'invalid-unselected-sibling',
      key: selectedGroup,
      body: malformed,
      expected: 'error',
      message: /does not match its OAS contract/,
    },
    {
      name: 'missing-runtime-key',
      key: selectedGroup,
      runtimeKey: true,
      provideKey: false,
      body: mapEntryBody,
      expected: 'error',
      message: /^Error: Workflow inputs do not match declared slots:/,
    },
  ];
  const workflows = [];
  for (const [index, entry] of cases.entries()) {
    const compiled = await compileMapEntryWorkflow(baseUrl, entry.key, {
      runtimeKey: entry.runtimeKey === true,
      provideKey: entry.provideKey !== false,
    });
    const workflow = {
      ...compiled.workflow,
      id: `map-entry-${runId}-${index}`,
    };
    workflows.push(workflow);
    await writeFile(
      new URL(`${entry.name}.workflow.json`, directory),
      JSON.stringify(workflow, null, 2),
    );
  }
  const made = await runDocker(['volume', 'create', volume]);
  assert.equal(made.code, 0, made.stderr);
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
  const imported = await runDocker(
    [...runtime, 'import:workflow', '--input=/dev/stdin'],
    JSON.stringify(workflows),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const executions = [];
  for (const [index, entry] of cases.entries()) {
    current = entry;
    const offset = requests.length;
    const executed = await runDocker([
      ...runtime,
      'execute',
      `--id=${workflows[index].id}`,
      '--rawOutput',
    ]);
    const result = readN8nExecution(executed.stdout);
    const received = requests.slice(offset),
      data = result.data.resultData;
    assert.equal(result.status, entry.expected, JSON.stringify(data.error));
    if (entry.expected === 'success') {
      const expectedItems = entry.body.result.items[entry.key];
      const actualItems = received
        .filter((request) => request.path === '/verify')
        .map((request) => request.body.item);
      assert.deepEqual(
        actualItems.map((item) => JSON.stringify(item)).sort(),
        expectedItems.map((item) => JSON.stringify(item)).sort(),
      );
      assert.equal(received.length, 1 + expectedItems.length);
      const selected = data.runData['selected-group'][0].data.main[0][0];
      assert.deepEqual(selected.json, { key: entry.key, value: expectedItems });
      const split = data.runData['each-item'][0].data.main[0];
      assert.deepEqual(
        split.map((item) => item.json.item),
        expectedItems,
      );
      if (entry.name === 'literal-key')
        assert.deepEqual(expectedItems, mapEntryItems);
    } else {
      assert.match(
        String(data.error?.stack ?? data.error?.message),
        entry.message,
      );
      assert.equal(
        received.filter((request) => request.path === '/verify').length,
        0,
      );
      assert.equal(
        received.length,
        entry.name === 'missing-runtime-key' ? 0 : 1,
      );
    }
    executions.push({
      name: entry.name,
      status: result.status,
      expected: entry.expected,
      lastNode: data.lastNodeExecuted,
      requests: received,
    });
  }
  assert.deepEqual(serverErrors, []);
  const report = {
    status: 'passed',
    scope:
      'Synthetic OAS, SDK, exact-key selection, existing native array split, linked REST requests and runtime key preflight. Not original-five generation, model quality or Qoopilot UI.',
    image,
    actualModelCalls: 0,
    businessApiCalls: 0,
    executions,
    localRequests: requests.length,
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      directory: directory.pathname,
      executions: executions.length,
      localRequests: requests.length,
    }),
  );
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (created) {
    const removed = await runDocker(['volume', 'rm', volume]);
    assert.equal(removed.code, 0, removed.stderr);
  }
}
