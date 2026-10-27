import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { URL, pathToFileURL } from 'node:url';
import { loadNodeTypes, trigger, workflow } from '@n8n/workflow-sdk';
import {
  createN8nOfficialNodePlanningCatalog,
  createN8nOfficialNode,
} from '@openapi-flow/n8n';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

// Fixed synthetic data and explicit settings, not a model-generated plan or OAS output-contract proof.
const sourceArgument = process.argv[2];
assert.ok(
  sourceArgument && isAbsolute(sourceArgument),
  'Pass the absolute report.json from integration/official-native-metadata.mjs',
);
const sourceUrl = pathToFileURL(sourceArgument);
const source = JSON.parse(await readFile(sourceUrl, 'utf8'));
assert.equal(source.status, 'passed');
const require = createRequire(import.meta.url);
assert.equal(
  source.sdkVersion,
  require('@n8n/workflow-sdk/package.json').version,
);
assert.match(source.imageId, /^sha256:[a-f0-9]{64}$/);
assert.ok(isAbsolute(source.generatedTemporaryDirectory));
const metadataUrl = new URL('official-nodes.json', sourceUrl);
assert.equal(
  createHash('sha256')
    .update(await readFile(metadataUrl))
    .digest('hex'),
  source.sourceSha256,
);
const definitions = await loadNodeTypes(metadataUrl.pathname, 'n8n-nodes-base');
const catalog = createN8nOfficialNodePlanningCatalog({
  definitions,
  selections: [
    { nodeType: 'n8n-nodes-base.set', version: 3.5 },
    { nodeType: 'n8n-nodes-base.splitOut', version: 1 },
    { nodeType: 'n8n-nodes-base.filter', version: 2.3 },
    { nodeType: 'n8n-nodes-base.aggregate', version: 1 },
    { nodeType: 'n8n-nodes-base.merge', version: 3.2 },
  ],
});
const runId = randomUUID();
const directory = new URL(
  `../.local-artifacts/official-native-node-runtime/${runId}/`,
  import.meta.url,
);
await mkdir(directory, { recursive: true });
const seed = {
  batch: 'literal-fixture',
  rows: [
    { id: '0007', amount: 0, enabled: true, value: null },
    { id: '0008', amount: 12, enabled: false, value: [] },
    { id: '0009', amount: -1, enabled: true, value: false },
  ],
};
function official(definitionId, id, position, parameters) {
  return createN8nOfficialNode({
    catalog,
    definitionId,
    schemaDirectories: [source.generatedTemporaryDirectory],
    configuration: { id, name: id, position, parameters },
  });
}
const start = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { id: 'start', name: 'Start', position: [0, 0] },
});
const seedNode = official('n8n-nodes-base.set@3.5', 'seed', [220, 0], {
  mode: 'raw',
  jsonOutput: JSON.stringify(seed),
  includeOtherFields: false,
  options: {},
});
const split = official('n8n-nodes-base.splitOut@1', 'split', [440, 0], {
  fieldToSplitOut: 'rows',
  include: 'allOtherFields',
  options: { destinationFieldName: 'item', disableDotNotation: true },
});
const filter = official('n8n-nodes-base.filter@2.3', 'filter', [660, 0], {
  conditions: {
    options: {
      caseSensitive: true,
      leftValue: '',
      typeValidation: 'strict',
      version: 2,
    },
    conditions: [
      {
        id: 'enabled-only',
        leftValue: '={{ $json.item.enabled }}',
        rightValue: true,
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      },
    ],
    combinator: 'and',
  },
  looseTypeValidation: false,
  options: {},
});
const aggregate = official(
  'n8n-nodes-base.aggregate@1',
  'aggregate',
  [880, 0],
  {
    aggregate: 'aggregateAllItemData',
    destinationFieldName: 'accepted',
    include: 'allFields',
    options: {},
  },
);
const side = official('n8n-nodes-base.set@3.5', 'side', [440, 220], {
  mode: 'raw',
  jsonOutput: JSON.stringify({ marker: 'independent-result' }),
  includeOtherFields: false,
  options: {},
});
const merge = official('n8n-nodes-base.merge@3.2', 'merge', [1100, 0], {
  mode: 'append',
  numberInputs: 2,
});
const builder = workflow(
  `official-native-${runId}`,
  'Official node configuration runtime proof',
);
for (const chain of [
  start.to(seedNode),
  seedNode.to(split),
  seedNode.to(side),
  split.to(filter),
  filter.to(aggregate),
  aggregate.to(merge.input(0)),
  side.to(merge.input(1)),
])
  builder.add(chain);
const json = builder.toJSON();
assert.equal(json.nodes.length, 7);
assert.equal(new Set(json.nodes.map((entry) => entry.id)).size, 7);
await writeFile(
  new URL('workflow.json', directory),
  JSON.stringify(json, null, 2),
);
console.log(
  JSON.stringify({
    status: 'started',
    directory: directory.pathname,
    sdkNativeInstances: 6,
    uniqueDefinitions: 5,
  }),
);
const volume = `openapi-flow-official-native-${runId}`;
let created = false;
try {
  const made = await runDocker(['volume', 'create', volume]);
  assert.equal(made.code, 0, made.stderr);
  created = true;
  // The exact image ID is the source of the metadata, not a drifting tag or a user instance.
  const runtime = [
    'run',
    '--rm',
    '-i',
    '--mount',
    `source=${volume},target=/home/node/.n8n`,
    '-e',
    'N8N_DIAGNOSTICS_ENABLED=false',
    source.imageId,
  ];
  const imported = await runDocker(
    [...runtime, 'import:workflow', '--input=/dev/stdin'],
    JSON.stringify([json]),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const executed = await runDocker([
    ...runtime,
    'execute',
    `--id=${json.id}`,
    '--rawOutput',
  ]);
  const result = readN8nExecution(executed.stdout);
  await writeFile(
    new URL('execution.json', directory),
    JSON.stringify(result, null, 2),
  );
  assert.equal(executed.code, 0, executed.stderr);
  assert.equal(
    result.status,
    'success',
    JSON.stringify(result.data.resultData.error),
  );
  const runData = result.data.resultData.runData;
  function output(name) {
    assert.ok(Array.isArray(runData[name]), `Missing execution for ${name}`);
    return runData[name].flatMap((run) => {
      assert.ok(
        Array.isArray(run.data?.main?.[0]),
        `Missing main output for ${name}`,
      );
      return run.data.main[0].map((entry) => entry.json);
    });
  }
  const splitRows = seed.rows.map((item) => ({ batch: seed.batch, item }));
  const accepted = [splitRows[0], splitRows[2]];
  assert.deepEqual(output('seed'), [seed]);
  assert.deepEqual(output('split'), splitRows);
  assert.deepEqual(output('filter'), accepted);
  assert.deepEqual(output('aggregate'), [{ accepted }]);
  assert.deepEqual(output('side'), [{ marker: 'independent-result' }]);
  assert.deepEqual(output('merge'), [
    { accepted },
    { marker: 'independent-result' },
  ]);
  const report = {
    status: 'passed',
    image: source.image,
    imageId: source.imageId,
    sdkVersion: source.sdkVersion,
    metadataSha256: source.sourceSha256,
    sdkNativeInstances: 6,
    uniqueDefinitions: 5,
    actualModelCalls: 0,
    businessApiCalls: 0,
    httpRequests: 0,
    scope:
      'Explicit official settings -> fail-closed SDK validation -> official node construction -> Manual/Set/Split Out/Filter/Aggregate/Merge isolated execution. Not OAS semantic contracts, parameter-generation quality, original-five scenarios or Qoopilot UI.',
    result: output('merge'),
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      directory: directory.pathname,
      sdkNativeInstances: report.sdkNativeInstances,
      outputItems: report.result.length,
    }),
  );
} finally {
  if (created) {
    const removed = await runDocker(['volume', 'rm', volume]);
    assert.equal(removed.code, 0, removed.stderr);
  }
}
