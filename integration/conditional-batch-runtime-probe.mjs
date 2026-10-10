import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { node, trigger, workflow } from '@n8n/workflow-sdk';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';
import { runDocker as docker } from './utils/run-docker.mjs';

// Probe the pinned execution engine before widening the library's batch contract.
const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-conditional-probe-${process.pid}-${Date.now()}`;
const rows = [{ amount: 2 }, { amount: 8 }, { amount: 1 }, { amount: 5 }];
const make = (type, id, parameters, version) =>
  node({
    type: 'n8n-nodes-base.' + type,
    version,
    config: { id, name: id, position: [400, 0], parameters },
  });
const cases = [1, 2, 10].map((size) => {
  const start = trigger({
    type: 'n8n-nodes-base.manualTrigger',
    version: 1,
    config: { id: 'start', name: 'Start', position: [0, 0] },
  });
  const input = make(
    'code',
    'Rows',
    {
      mode: 'runOnceForAllItems',
      jsCode: `return ${JSON.stringify(rows)}.map(json=>({json}));`,
    },
    2,
  );
  const loop = make(
    'splitInBatches',
    'Loop',
    { batchSize: size, options: { reset: false } },
    3,
  );
  const condition = make(
    'if',
    'Condition',
    {
      conditions: {
        options: { typeValidation: 'strict', version: 2 },
        conditions: [
          {
            id: 'threshold',
            leftValue: '={{ $json.amount }}',
            rightValue: 3,
            operator: { type: 'number', operation: 'gt' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    2.2,
  );
  const yes = make('noOp', 'True', {}, 1);
  const no = make('noOp', 'False', {}, 1);
  const merge = make(
    'merge',
    'Rejoin',
    { mode: 'append', numberInputs: 2 },
    3.2,
  );
  const done = make('noOp', 'Done', {}, 1);
  const built = workflow(
    'conditional-probe-' + size,
    'Conditional runtime probe',
  )
    .add(start)
    .add(input)
    .add(loop)
    .add(condition)
    .add(yes)
    .add(no)
    .add(merge)
    .add(done)
    .connect(start, 0, input, 0)
    .connect(input, 0, loop, 0)
    .connect(loop, 1, condition, 0)
    .connect(condition, 0, yes, 0)
    .connect(condition, 1, no, 0)
    .connect(yes, 0, merge, 0)
    .connect(no, 0, merge, 1)
    .connect(merge, 0, loop, 0)
    .connect(loop, 0, done, 0)
    .toJSON();
  built.settings = { ...built.settings, executionOrder: 'v1' };
  return { size, workflow: built };
});
let created = false;
try {
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
    JSON.stringify(cases.map((item) => item.workflow)),
  );
  assert.equal(imported.code, 0, imported.stderr);
  for (const sample of cases) {
    const output = await docker([
      ...runtime,
      'execute',
      '--id=' + sample.workflow.id,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    assert.equal(execution.status, 'success');
    const data = execution.data.resultData.runData;
    assert.equal(data.Done?.length, 1, 'Every batch must return before Done');
    const received = data.Done[0].data.main[0]
      .map((item) => item.json.amount)
      .sort((a, b) => a - b);
    assert.deepEqual(
      received,
      rows.map((item) => item.amount).sort((a, b) => a - b),
    );
    assert.equal(data.Loop.length, Math.ceil(rows.length / sample.size) + 1);
    console.log(
      JSON.stringify({ size: sample.size, status: 'passed', values: received }),
    );
  }
} finally {
  if (created) assert.equal((await docker(['volume', 'rm', volume])).code, 0);
}
