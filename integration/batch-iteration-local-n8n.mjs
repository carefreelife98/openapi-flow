import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { compileBatchedN8nWorkflow } from '@openapi-flow/n8n';
import {
  compileBatchIteration,
  createBatchIterationInput,
} from '../test/fixtures/batch-iteration-fixture.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';
import { compileConditionalBatch } from '../test/fixtures/conditional-batch-fixture.mjs';
import { runDocker as docker } from './utils/run-docker.mjs';

const rows = [
  { id: 'same/42', amount: 8 },
  { id: 'other', amount: 2 },
  { id: 'same/42', amount: 5 },
];
const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-batch-${process.pid}-${Date.now()}`;
const calls = [];
const failures = [];
let mode = 'normal';
const conditional = process.argv.includes('--conditional');
let executionOffset = 0;
let expectedProcessed = rows;
const receiptFor = (row) => row.id + ':' + row.amount;
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
    if (path === '/records')
      result = {
        records:
          mode === 'empty'
            ? []
            : mode === 'invalid-source'
              ? [{ ...rows[0], amount: '8' }]
              : rows,
      };
    else if (path === '/submit') {
      assert.deepEqual(
        sorted(body),
        sorted(rows),
        'Completion must collect every original response across node runs',
      );
      assert.equal(
        calls.slice(executionOffset).filter((call) => call.path === '/audit')
          .length,
        expectedProcessed.length,
      );
      result = { accepted: body.length };
    } else {
      assert.ok(
        rows.some((row) => JSON.stringify(row) === JSON.stringify(body)),
        'Request must preserve its original item',
      );
      if (path === '/details')
        result = {
          receipt:
            mode === 'invalid-response' && body.amount === 2
              ? 42
              : receiptFor(body),
          input: body,
        };
      else if (path.startsWith('/confirm/')) {
        assert.ok(
          expectedProcessed.some(
            (row) => JSON.stringify(row) === JSON.stringify(body),
          ),
          'Skipped items must never call the business API',
        );
        assert.equal(
          decodeURIComponent(path.slice('/confirm/'.length)),
          receiptFor(body),
        );
        result = body;
      } else if (path === '/audit')
        result =
          mode === 'assertion-failure' && body.amount === (conditional ? 8 : 2)
            ? { ...body, amount: body.amount + 1 }
            : body;
      else throw Error('Unexpected local route ' + path);
    }
    response.writeHead(200, {
      'content-type':
        mode === 'wrong-media' && path === '/details'
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
  const ordinaryWorkflows = [1, 2, 10].map(
    (size) =>
      compileBatchIteration(
        size,
        `http://host.docker.internal:${server.address().port}`,
      ).workflow,
  );
  const adjacent = createBatchIterationInput(
    2,
    `http://host.docker.internal:${server.address().port}`,
  );
  adjacent.id = 'batch-adjacent';
  adjacent.batchScopes = [
    {
      id: 'detail-only',
      batchSize: 1,
      nodeIds: ['details'],
      entryNodeId: 'details',
      exitNodeId: 'details',
    },
    {
      id: 'follow-up',
      batchSize: 2,
      nodeIds: ['confirm', 'audit', 'verify-item'],
      entryNodeId: 'confirm',
      exitNodeId: 'verify-item',
    },
  ];
  ordinaryWorkflows.push(compileBatchedN8nWorkflow(adjacent).workflow);
  const initial = createBatchIterationInput(
    2,
    `http://host.docker.internal:${server.address().port}`,
  );
  initial.id = 'batch-initial';
  initial.batchScopes.unshift({
    id: 'initial-call',
    batchSize: 1,
    nodeIds: ['records'],
    entryNodeId: 'records',
    exitNodeId: 'records',
  });
  ordinaryWorkflows.push(compileBatchedN8nWorkflow(initial).workflow);
  const workflows = conditional
    ? [1, 2, 10].flatMap((size) =>
        [0, 3, 10].map(
          (threshold) =>
            compileConditionalBatch(
              size,
              `http://host.docker.internal:${server.address().port}`,
              threshold,
            ).workflow,
        ),
      )
    : ordinaryWorkflows;
  const directory = new URL(
    conditional
      ? '../.local-artifacts/conditional-batch/'
      : '../.local-artifacts/batch-iteration/',
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  for (const workflow of workflows)
    await writeFile(
      new URL(`workflow-${workflow.id}.json`, directory),
      JSON.stringify(workflow, null, 2),
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
  const ordinaryCases = [
    { mode: 'normal', size: 1 },
    { mode: 'normal', size: 2 },
    { mode: 'normal', size: 10 },
    { mode: 'normal', size: 2, variant: 'adjacent' },
    { mode: 'normal', size: 2, variant: 'initial' },
    { mode: 'empty', size: 1 },
    { mode: 'invalid-source', size: 1 },
    { mode: 'invalid-response', size: 1 },
    { mode: 'wrong-media', size: 1 },
    { mode: 'assertion-failure', size: 1 },
  ];
  const cases = conditional
    ? [1, 2, 10]
        .flatMap((size) =>
          [0, 3, 10].map((threshold) => ({ mode: 'normal', size, threshold })),
        )
        .concat(
          [
            'empty',
            'invalid-source',
            'invalid-response',
            'wrong-media',
            'assertion-failure',
          ].map((mode) => ({ mode, size: 1, threshold: 3 })),
        )
    : ordinaryCases;
  for (const sample of cases) {
    mode = sample.mode;
    const offset = calls.length;
    executionOffset = offset;
    expectedProcessed = conditional
      ? rows.filter((row) => row.amount > sample.threshold)
      : rows;
    const output = await docker([
      ...runtime,
      'execute',
      '--id=' +
        (conditional
          ? `conditional-batch-${sample.size}-${sample.threshold}`
          : sample.variant
            ? 'batch-' + sample.variant
            : 'batch-iteration-' + sample.size),
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const data = execution.data.resultData;
    const received = calls.slice(offset);
    assert.deepEqual(failures, []);
    if (mode === 'normal') {
      assert.equal(execution.status, 'success', JSON.stringify(data.error));
      assert.equal(received.length, 5 + 2 * expectedProcessed.length);
      for (const path of ['/details', '/audit'])
        assert.deepEqual(
          sorted(
            received
              .filter((call) => call.path === path)
              .map((call) => call.body),
          ),
          sorted(path === '/audit' ? expectedProcessed : rows),
        );
      assert.equal(received.at(-1).path, '/submit');
      const lengths = [];
      for (let offset = 0; offset < rows.length; offset += sample.size)
        lengths.push(Math.min(sample.size, rows.length - offset));
      for (const name of [
        'Materialize details',
        'Request details',
        'Materialize confirm',
        'Request confirm',
        'Request audit',
        'verify-item',
      ]) {
        const expectedLengths =
          conditional && !name.endsWith(' details')
            ? rows
                .reduce((batches, _, index) => {
                  if (index % sample.size === 0)
                    batches.push(
                      rows
                        .slice(index, index + sample.size)
                        .filter((row) => row.amount > sample.threshold).length,
                    );
                  return batches;
                }, [])
                .filter((length) => length > 0)
            : sample.variant === 'adjacent' && name.endsWith(' details')
              ? [1, 1, 1]
              : lengths;
        if (expectedLengths.length === 0)
          assert.equal(
            data.runData[name],
            undefined,
            `${name} must never run on skipped items`,
          );
        else {
          assert.ok(
            Array.isArray(data.runData[name]),
            `${name} requires actual executions`,
          );
          assert.deepEqual(
            data.runData[name].map((run) => run.data.main[0].length),
            expectedLengths,
            name,
          );
        }
      }
      const loopRuns =
        data.runData[
          sample.variant === 'adjacent' ? 'follow-up' : 'process-record-batches'
        ];
      assert.equal(loopRuns.length, lengths.length + 1);
      assert.equal(loopRuns.at(-1).data.main[0].length, 3);
      if (!conditional)
        assert.ok(
          loopRuns.at(-1).data.main[0].every((item) => item.json.pass === true),
        );
      assert.equal(data.runData['Request submit'].length, 1);
      assert.equal(
        data.runData['Request submit'][0].data.main[0][0].json.body.accepted,
        3,
      );
    } else if (mode === 'empty') {
      assert.equal(execution.status, 'success', JSON.stringify(data.error));
      assert.equal(received.length, 1);
      assert.equal(data.runData['Request details'], undefined);
      assert.equal(data.runData['Request submit'], undefined);
    } else {
      assert.equal(execution.status, 'error');
      assert.equal(
        data.lastNodeExecuted,
        mode === 'invalid-source'
          ? 'Read array each-record'
          : mode === 'assertion-failure'
            ? 'verify-item'
            : conditional
              ? 'Validate responses eligible'
              : 'Materialize confirm',
      );
      assert.equal(data.runData['Request submit'], undefined);
      assert.ok(
        !received.some((call) => call.body?.amount === 5),
        'No later batch may run after an error',
      );
      if (mode === 'invalid-response')
        assert.equal(
          received.filter((call) => call.path.startsWith('/confirm/')).length,
          1,
        );
    }
    results.push({
      ...sample,
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
