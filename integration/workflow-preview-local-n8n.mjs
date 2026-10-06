import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';
import { createReviewableWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  generationInput,
  scriptedReviewModel,
} from '../test/fixtures/workflow-preview-fixture.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-review-preview-${process.pid}-${Date.now()}`;
const execute = promisify(execFile);
const directory = new URL(
  '../.local-artifacts/workflow-preview/',
  import.meta.url,
);
const modes = ['selection-gap', 'binding-gap', 'graph-gap'];
const previews = [];
for (const mode of modes) {
  const model = scriptedReviewModel(mode);
  const result = await createReviewableWorkflowGenerationGraph({
    model,
    capabilities: createN8nNativeCapabilities(),
  }).invoke({ ...generationInput, workflowId: `public-preview-${mode}` });
  assert.equal(result.workflow, undefined);
  assert.equal(result.preview.executable, false);
  previews.push(result.preview.previewWorkflow);
}
await mkdir(directory, { recursive: true });
for (const [index, preview] of previews.entries())
  await writeFile(
    new URL(`${modes[index]}.workflow.json`, directory),
    JSON.stringify(preview, null, 2),
  );
const path = new URL('preview.workflows.json', directory);
await writeFile(path, JSON.stringify(previews, null, 2));
const args = [
  'run',
  '--rm',
  '--network',
  'none',
  '--mount',
  `source=${volume},target=/home/node/.n8n`,
  '--mount',
  `type=bind,source=${fileURLToPath(path)},target=/tmp/previews.json,readonly`,
  '-e',
  'N8N_DIAGNOSTICS_ENABLED=false',
  image,
];
let created = false;
try {
  await execute('docker', ['volume', 'create', volume]);
  created = true;
  const imported = await execute(
    'docker',
    [...args, 'import:workflow', '--input=/tmp/previews.json'],
    { timeout: 60_000 },
  );
  assert.match(imported.stdout, /Successfully imported 3 workflows?/);
  await execute(
    'docker',
    [
      ...args,
      'export:workflow',
      '--all',
      '--output=/home/node/.n8n/exported-previews.json',
    ],
    { timeout: 60_000 },
  );
  const exported = await execute('docker', [
    'run',
    '--rm',
    '--network',
    'none',
    '--entrypoint',
    'node',
    '--mount',
    `source=${volume},target=/home/node/.n8n`,
    image,
    '-e',
    "process.stdout.write(require('node:fs').readFileSync('/home/node/.n8n/exported-previews.json','utf8'))",
  ]);
  const workflows = JSON.parse(exported.stdout);
  assert.equal(workflows.length, previews.length);
  for (const expected of previews) {
    const actual = workflows.find((item) => item.id === expected.id);
    assert.ok(actual);
    assert.equal(actual.active, false);
    assert.deepEqual(actual.connections, {});
    assert.equal(actual.nodes.length, expected.nodes.length);
    for (const note of expected.nodes) {
      const actualNote = actual.nodes.find((item) => item.id === note.id);
      assert.equal(actualNote.type, 'n8n-nodes-base.stickyNote');
      assert.deepEqual(actualNote.parameters, note.parameters);
      assert.deepEqual(actualNote.position, note.position);
      assert.equal(actualNote.credentials, undefined);
    }
  }
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(
      {
        endedAt: new Date().toISOString(),
        image,
        imported: workflows.length,
        exported: workflows.length,
        cases: modes,
        notesAndColorsPreserved: true,
        active: false,
        executableNodes: 0,
        connections: 0,
        network: 'none',
        executed: false,
        actualServiceCalls: false,
        actualModelCalls: false,
        fixture:
          'public multi-OAS fixture with scripted structured model responses',
      },
      null,
      2,
    ),
  );
  console.log(
    'workflow-preview: PASSED (3 gap stages imported/exported as inactive Sticky Notes only; network disabled)',
  );
} finally {
  if (created) await execute('docker', ['volume', 'rm', volume]);
}
