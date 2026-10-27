import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';
import {
  createOrchestratedWorkflowGenerationGraph,
  createConversationalWorkflowGenerationGraph,
  NativeSelectionPlanningStoppedError,
} from '@openapi-flow/example-langgraph-workflow';
import { nativeSelectionParentFixture } from '../test/fixtures/native-selection-parent-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

// A scripted model deliberately reports a false gap; no model-quality or original-five claim.
const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-native-selection-${process.pid}-${randomUUID()}`;
const directory = new URL(
  `../.local-artifacts/native-selection-planning/${randomUUID()}/`,
  import.meta.url,
);
await mkdir(directory, { recursive: true });
const generated = [],
  blocked = [];
for (const [name, create] of [
  ['orchestrated', createOrchestratedWorkflowGenerationGraph],
  ['conversational', createConversationalWorkflowGenerationGraph],
]) {
  const f = nativeSelectionParentFixture('native-selection-' + name);
  const result = await create(f.dependencies).invoke(f.input, {
    configurable: { thread_id: name },
    recursionLimit: 100,
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.nativeSelectionPlanning.modelInvocations, 3);
  assert.equal(result.nativeSelectionPlanning.reselections, 1);
  assert.equal(result.nativeSelectionPlanning.reviews.length, 1);
  assert.equal(result.nativeSelection.gaps.length, 0);
  assert.deepEqual(
    f.progress.map((event) => event.phase),
    ['selected', 'reviewed', 'ready'],
  );
  await writeFile(
    new URL(name + '.json', directory),
    JSON.stringify(result.workflow, null, 2),
  );
  generated.push({ name, result, structuredCalls: f.calls.length });
  const b = nativeSelectionParentFixture('blocked-' + name, true);
  await assert.rejects(
    create(b.dependencies).invoke(b.input, {
      configurable: { thread_id: 'blocked-' + name },
      recursionLimit: 100,
    }),
    (error) =>
      error instanceof NativeSelectionPlanningStoppedError &&
      error.failure.selection.gaps.length === 1,
  );
  assert.equal(b.calls.length, 2);
  blocked.push({ name, scriptedCalls: b.calls.length, engineExecutions: 0 });
}
let created = false;
try {
  const inspected = await runDocker([
    'image',
    'inspect',
    image,
    '--format',
    '{{.Id}}',
  ]);
  assert.equal(inspected.code, 0, inspected.stderr);
  const create = await runDocker(['volume', 'create', volume]);
  assert.equal(create.code, 0, create.stderr);
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
    JSON.stringify(generated.map((entry) => entry.result.workflow)),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const results = [];
  for (const { name, result, structuredCalls } of generated) {
    const output = await runDocker([
      ...runtime,
      'execute',
      '--id=' + result.workflow.id,
      '--rawOutput',
    ]);
    assert.equal(output.code, 0, output.stderr);
    const execution = readN8nExecution(output.stdout);
    assert.equal(
      execution.status,
      'success',
      JSON.stringify(execution.data.resultData.error),
    );
    const node = result.workflow.nodes.find(
      (entry) => entry.type === 'n8n-nodes-base.set',
    );
    assert(node, 'The result must use official Edit Fields');
    const rows = execution.data.resultData.runData[node.name][0].data.main[0];
    assert.deepEqual(
      rows.map((row) => row.json),
      [{ enabled: false }],
    );
    results.push({
      name,
      status: execution.status,
      output: rows.map((row) => row.json),
      scriptedStructuredCalls: structuredCalls,
      selectionCalls: result.nativeSelectionPlanning.modelInvocations,
    });
  }
  const report = {
    image,
    imageId: inspected.stdout.trim(),
    results,
    blocked,
    liveModelCalls: 0,
    businessApiCalls: 0,
    scope:
      'Two example parents, inherited checkpoint, explicit review/reselection and official Edit Fields engine output. Not Qoopilot UI or original-five quality.',
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
