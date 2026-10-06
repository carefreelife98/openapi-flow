import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-deployment-template-${process.pid}-${Date.now()}`;
const execute = promisify(execFile);
const directory = new URL(
  '../.local-artifacts/deployment-template/',
  import.meta.url,
);
const spec = JSON.parse(
  await readFile(
    new URL(
      '../examples/langgraph-workflow/specs/inventory.openapi.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const catalog = await createApiCatalog([{ id: 'inventory', spec }]);
const entry = catalog.operations.find((item) => item.path === '/products/{id}');
assert.ok(entry);
const [operation] = await resolveApiOperations(catalog, [entry.key]);
const fragment = createHttpRequestNode({
  operation,
  arguments: {
    callId: 'read-product',
    values: { path: { id: 'item-1' } },
    bindings: [],
    unresolvedInputs: [],
  },
  position: [300, 0],
});
const { workflow } = assembleN8nWorkflow({
  id: 'deployment-template',
  name: 'Replace deployment before execution',
  nodes: [fragment],
  edges: [],
  starts: [fragment.nodeId],
});
await mkdir(directory, { recursive: true });
const path = new URL('workflow.json', directory);
await writeFile(path, JSON.stringify(workflow, null, 2));
const args = [
  'run',
  '--rm',
  '--network',
  'none',
  '--mount',
  `source=${volume},target=/home/node/.n8n`,
  '--mount',
  `type=bind,source=${fileURLToPath(path)},target=/tmp/workflow.json,readonly`,
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
    [...args, 'import:workflow', '--input=/tmp/workflow.json'],
    { timeout: 60_000 },
  );
  assert.match(imported.stdout, /Successfully imported 1 workflow/);
  await execute(
    'docker',
    [
      ...args,
      'export:workflow',
      '--id=deployment-template',
      '--output=/home/node/.n8n/exported-workflow.json',
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
    "process.stdout.write(require('node:fs').readFileSync('/home/node/.n8n/exported-workflow.json','utf8'))",
  ]);
  const workflows = JSON.parse(exported.stdout);
  assert.equal(workflows.length, 1);
  const request = workflows[0].nodes.find(
    (node) => node.type === 'n8n-nodes-base.httpRequest',
  );
  assert.equal(
    request.parameters.url,
    'https://replace_me.invalid/products/item-1',
  );
  assert.equal(
    request.credentials.httpBearerAuth.id,
    'REPLACE_ME:inventory:bearer',
  );
  assert.match(
    request.notes,
    /REPLACE_ME.*inventory.*baseUrl.*credentialBindings.bearer/,
  );
  assert.equal(request.notesInFlow, true);
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(
      {
        endedAt: new Date().toISOString(),
        image,
        imported: true,
        exportedPlaceholdersPreserved: true,
        executed: false,
        network: 'none',
        actualServiceCalls: false,
        credentialSecretsStored: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'deployment-template: PASSED (import/export preserves URL, credential placeholders and notes; network disabled)',
  );
} finally {
  if (created) await execute('docker', ['volume', 'rm', volume]);
}
