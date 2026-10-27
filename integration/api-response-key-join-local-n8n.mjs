import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import console from 'node:console';
import { isDeepStrictEqual } from 'node:util';
import {
  compileKeyJoinWorkflow,
  keyJoinParameters,
  keyJoinLeftRows as left,
  keyJoinRightRows as right,
} from '../test/fixtures/api-response-key-join-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

// Synthetic contracts and fixed plans only. No models, business services or user instance.
const runId = randomUUID(),
  image = 'n8nio/n8n:2.37.10';
const directory = new URL(
  `../.local-artifacts/api-response-key-join/${runId}/`,
  import.meta.url,
);
const volume = `openapi-flow-key-join-${runId}`;
const requests = [],
  serverErrors = [];
let current,
  created = false;
const server = createServer((request, response) => {
  try {
    assert.ok(current);
    assert.equal(request.method, 'GET');
    const path = new URL(request.url, 'http://fixture.local').pathname;
    requests.push({ method: request.method, path });
    assert.ok(path === '/left' || path === '/right');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(
        path === '/left'
          ? {
              rows: current.leftRows,
              checksum: current.badChecksum ? 'invalid' : 0,
            }
          : { entries: current.rightRows, checksum: 0 },
      ),
    );
  } catch (error) {
    serverErrors.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: error.message }));
  }
});
const pair = (l, r) => ({ key: left[l].id, left: left[l], right: right[r] });
const matches = [
  pair(0, 4),
  pair(1, 2),
  pair(2, 0),
  pair(2, 3),
  pair(3, 0),
  pair(3, 3),
  pair(5, 5),
];
const unmatchedLeft = { key: left[4].id, left: left[4] },
  unmatchedRight = { key: right[1].lookup.code, right: right[1] };
const leftMissing = { marker: 'left-missing', data: null },
  rightMissing = { lookup: {}, marker: 'right-missing', data: [] };
const leftNull = { id: null, marker: 'left-null', data: 0 },
  rightNull = { lookup: { code: null }, marker: 'right-null', data: false };
const leftFalse = { id: false, marker: 'left-false', data: [] },
  rightFalse = { lookup: { code: false }, marker: 'right-false', data: null };
const cases = [
  {
    name: 'full-reversed-typed-duplicates',
    output: [...matches, unmatchedLeft, unmatchedRight],
  },
  { name: 'inner', joinMode: 'inner', output: matches },
  { name: 'left', joinMode: 'left', output: [...matches, unmatchedLeft] },
  { name: 'right', joinMode: 'right', output: [...matches, unmatchedRight] },
  {
    name: 'empty-right',
    rightRows: [],
    output: left.map((row) => ({ key: row.id, left: row })),
  },
  {
    name: 'empty-left',
    leftRows: [],
    output: right.map((row) => ({ key: row.lookup.code, right: row })),
  },
  { name: 'both-empty', leftRows: [], rightRows: [], output: [] },
  {
    name: 'absent-unmatched-null-false',
    missingKeys: 'unmatched',
    leftRows: [leftMissing, leftNull, leftFalse],
    rightRows: [rightMissing, rightFalse, rightNull],
    output: [
      { left: leftMissing },
      { right: rightMissing },
      { key: null, left: leftNull, right: rightNull },
      { key: false, left: leftFalse, right: rightFalse },
    ],
  },
  {
    name: 'missing-key-rejected',
    leftRows: [leftMissing],
    error: /Key join left missing key/,
  },
  {
    name: 'invalid-unselected-field-rejected',
    badChecksum: true,
    error: /does not match its OAS contract/,
  },
].map((entry) => ({
  leftRows: left,
  rightRows: right,
  joinMode: 'full',
  missingKeys: 'error',
  ...entry,
}));
function assertUnorderedRows(actual, expected, label) {
  const remaining = [...expected];
  for (const row of actual) {
    const index = remaining.findIndex((candidate) =>
      isDeepStrictEqual(candidate, row),
    );
    assert.notEqual(
      index,
      -1,
      `${label}: unexpected row ${JSON.stringify(row)}`,
    );
    remaining.splice(index, 1);
  }
  assert.deepEqual(remaining, [], `${label}: missing expected rows`);
}
try {
  await mkdir(directory, { recursive: true });
  console.log(
    JSON.stringify({
      status: 'started',
      directory: directory.pathname,
      cases: cases.length,
    }),
  );
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const workflows = [];
  for (const [index, entry] of cases.entries()) {
    const compiled = await compileKeyJoinWorkflow(baseUrl, {
      ...keyJoinParameters,
      joinMode: entry.joinMode,
      missingKeys: entry.missingKeys,
    });
    const workflow = { ...compiled.workflow, id: `key-join-${runId}-${index}` };
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
    const result = readN8nExecution(executed.stdout),
      data = result.data.resultData;
    await writeFile(
      new URL(`${entry.name}.execution.json`, directory),
      JSON.stringify(result, null, 2),
    );
    assert.equal(
      result.status,
      entry.error ? 'error' : 'success',
      JSON.stringify(data.error),
    );
    const outputs =
      data.runData['matched-results']
        ?.flatMap((run) => run.data?.main?.[0] ?? [])
        .map((item) => item.json) ?? [];
    if (entry.error)
      assert.match(
        String(data.error?.stack ?? data.error?.message),
        entry.error,
      );
    else {
      assertUnorderedRows(outputs, entry.output, entry.name);
      assert.equal(requests.length - offset, 2);
    }
    executions.push({
      name: entry.name,
      status: result.status,
      rows: outputs,
      requests: requests.slice(offset),
      lastNode: data.lastNodeExecuted,
    });
    console.log(
      JSON.stringify({
        name: entry.name,
        status: result.status,
        outputItems: outputs.length,
      }),
    );
  }
  assert.deepEqual(serverErrors, []);
  const report = {
    status: 'passed',
    scope:
      'Synthetic OAS, fixed plans, official SDK Merge key matching, four retention modes, duplicate cross-products, empty inputs, missing/null/false keys and full-response validation. Not original-five generation, live model quality or Qoopilot UI.',
    image,
    actualModelCalls: 0,
    businessApiCalls: 0,
    localRequests: requests.length,
    executions,
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
