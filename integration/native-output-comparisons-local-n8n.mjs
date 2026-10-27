import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';
import { compileNativeComparisonWorkflow } from '../test/fixtures/native-comparison-workflow-fixture.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-native-comparison-${process.pid}-${randomUUID()}`;
const directory = new URL(
  `../.local-artifacts/native-output-comparisons/${randomUUID()}/`,
  import.meta.url,
);
const defaults = {
  splitItems: true,
  linked: true,
  empty: false,
  reverseItems: false,
  optionalPointer: false,
  assertionFailure: false,
};
const cases = [
  { name: 'two-items', flags: defaults, failure: false },
  {
    name: 'reverse-items',
    flags: { ...defaults, reverseItems: true },
    failure: false,
  },
  { name: 'empty-items', flags: { ...defaults, empty: true }, failure: false },
  {
    name: 'ambiguous-multi-item',
    flags: { ...defaults, linked: false },
    failure: true,
    message: /unambiguous single JSON item/,
  },
  {
    name: 'invalid-native-contract',
    flags: { ...defaults, splitItems: false },
    failure: true,
    message: /Native output does not match declared schema/,
  },
  {
    name: 'missing-optional',
    flags: { ...defaults, splitItems: false, optionalPointer: true },
    failure: true,
    message: /Missing native output pointer/,
  },
  {
    name: 'assertion-failure',
    flags: { ...defaults, splitItems: false, assertionFailure: true },
    failure: true,
    message: /Original boolean must be false/,
  },
];
let created = false;
try {
  await mkdir(directory, { recursive: true });
  const imageInfo = await runDocker([
    'image',
    'inspect',
    image,
    '--format',
    '{{.Id}}',
  ]);
  assert.equal(imageInfo.code, 0, imageInfo.stderr);
  assert.match(imageInfo.stdout.trim(), /^sha256:[a-f0-9]{64}$/);
  const fixtures = cases.map((entry) => {
    const result = compileNativeComparisonWorkflow(entry.flags);
    result.workflow.id = 'native-comparison-' + entry.name;
    if (entry.name === 'invalid-native-contract') {
      // Deliberately violate the declared producer after compilation; no product schema is changed.
      const producer = result.workflow.nodes.find(
        (node) => node.id === 'joined',
      );
      assert.ok(producer);
      producer.parameters.jsonOutput = JSON.stringify({
        item: {
          amount: 0,
          enabled: false,
          nothing: null,
          code: 7,
          values: [],
          'a/b~c': '',
        },
      });
    }
    return { ...entry, ...result };
  });
  await writeFile(
    new URL('workflow.import.json', directory),
    JSON.stringify(fixtures[0].workflow, null, 2),
  );
  await writeFile(
    new URL('workflows.import.json', directory),
    JSON.stringify(
      fixtures.map((entry) => entry.workflow),
      null,
      2,
    ),
  );
  const initialized = await runDocker(['volume', 'create', volume]);
  assert.equal(initialized.code, 0, initialized.stderr);
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
    JSON.stringify(fixtures.map((entry) => entry.workflow)),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const results = [];
  for (const entry of fixtures) {
    const result = await runDocker([
      ...runtime,
      'execute',
      '--id=' + entry.workflow.id,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(result.stdout);
    const data = execution.data.resultData;
    assert.equal(
      execution.status,
      entry.failure ? 'error' : 'success',
      JSON.stringify(data.error),
    );
    if (entry.failure) {
      assert.match(data.error.stack, entry.message);
      if (entry.name !== 'assertion-failure')
        assert.equal(data.runData['assert-original'], undefined);
      assert.equal(data.runData['other-items'], undefined);
    } else if (entry.name === 'empty-items') {
      assert.equal(data.runData.gate, undefined);
      assert.equal(data.runData['assert-original'], undefined);
      assert.equal(data.runData['other-items'], undefined);
    } else {
      const actual = data.runData.gate[0].data.main;
      const trueRows = entry.rows.filter((row) => row.item.amount > -1);
      const falseRows = entry.rows.filter((row) => row.item.amount <= -1);
      assert.deepEqual(
        actual[0].map((item) => item.json),
        trueRows,
      );
      assert.deepEqual(
        actual[1].map((item) => item.json),
        falseRows,
      );
      assert.deepEqual(
        data.runData['other-items'][0].data.main[0].map((item) => item.json),
        falseRows,
      );
      assert.deepEqual(
        data.runData['assert-original'][0].data.main[0].map(
          (item) => item.json,
        ),
        [{ pass: true, assertionCount: 1 }],
      );
      assert.equal(actual[0][0].json.item.enabled, false);
      assert.equal(actual[0][0].json.item.amount, 0);
      assert.equal(actual[0][0].json.item.code, '0007');
      assert.equal(actual[0][0].json.item.nothing, null);
      assert.deepEqual(actual[0][0].json.item.values, ['={{ literal }}']);
    }
    const record = {
      name: entry.name,
      status: execution.status,
      lastNode: data.lastNodeExecuted,
    };
    results.push(record);
    console.log(JSON.stringify(record));
  }
  const report = {
    image,
    imageId: imageInfo.stdout.trim(),
    modelCalls: 0,
    businessApiCalls: 0,
    nativeFeatureAdded: false,
    results,
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      { artifactDirectory: directory.pathname, ...report },
      null,
      2,
    ),
  );
} finally {
  if (created) {
    const removed = await runDocker(['volume', 'rm', volume]);
    assert.equal(removed.code, 0, removed.stderr);
  }
}
