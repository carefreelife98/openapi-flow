import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  createWorkflowConnectionSession,
  describeWorkflowConnectionStep,
  applyWorkflowConnectionStep,
} from '@openapi-flow/core';
import {
  createJsonOutputCapability,
  createN8nNativeCapabilities,
  compileWorkflowConnectionDelivery,
} from '@openapi-flow/n8n';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

// Synthetic, network-free workflow data. No business service, credentials or persistent n8n instance.
const image = 'n8nio/n8n:2.37.10';
const output = new URL(
  `../.local-artifacts/connection-delivery/${Date.now()}/`,
  import.meta.url,
);
await mkdir(output, { recursive: true });
const context = createJsonOutputCapability({
  name: 'context',
  description: 'Emit the explicitly supplied business value.',
  parametersSchema: z.strictObject({ value: z.string() }),
});
const basis = {
  factIds: ['request'],
  reason: 'Preserve the original synthetic request.',
};
const original =
  'Produce A independently. B has an explicitly unsupported external guarantee.';
const source = {
  scenario: original,
  materials: [],
  capabilities: [context],
  nativeNodes: [
    { id: 'a', capability: 'context', parameters: { value: 'A' } },
    { id: 'b', capability: 'context', parameters: { value: 'B' } },
  ],
  requirements: [
    {
      id: 'request',
      text: original,
      sources: [{ kind: 'message', messageId: 'request', quote: original }],
    },
  ],
};
function compile(input, goals, roots, edges, terminals, name) {
  let session = createWorkflowConnectionSession({ ...input, goals });
  const applied = applyWorkflowConnectionStep({
    ...input,
    session,
    expected: describeWorkflowConnectionStep({ ...input, session }).expected,
    proposal: {
      kind: 'patch',
      addEdges: edges,
      removeEdgeIds: [],
      addRootNodeIds: roots,
      removeRootNodeIds: [],
      addTerminals: terminals,
      removeTerminals: [],
      ...basis,
    },
  });
  assert.equal(applied.status, 'accepted');
  session = applied.session;
  return compileWorkflowConnectionDelivery({
    ...input,
    session,
    id: name,
    name,
    apiNodes: [],
  });
}
async function execute(workflow) {
  assert.match(workflow.id, /^[a-zA-Z0-9_:-]+$/u);
  const result = await runDocker(
    [
      'run',
      '--rm',
      '-i',
      '--tmpfs',
      '/home/node/.n8n:uid=1000,gid=1000,mode=0700,size=256m',
      '--tmpfs',
      '/tmp:uid=1000,gid=1000,mode=0700,size=128m',
      '-e',
      'N8N_DIAGNOSTICS_ENABLED=false',
      '-e',
      'N8N_VERSION_NOTIFICATIONS_ENABLED=false',
      '-e',
      'EXECUTIONS_DATA_SAVE_ON_SUCCESS=none',
      '-e',
      'EXECUTIONS_DATA_SAVE_ON_ERROR=none',
      '--entrypoint=/bin/sh',
      image,
      '-c',
      `set -e\ncat > /tmp/workflow.json\nn8n import:workflow --input=/tmp/workflow.json\nn8n execute --id=${workflow.id} --rawOutput`,
    ],
    JSON.stringify([workflow]),
  );
  return readN8nExecution(result.stdout);
}
const partial = compile(
  source,
  [
    { kind: 'operation-set', nodeIds: [], ...basis },
    {
      kind: 'material-value',
      nodeId: 'a',
      materialKind: 'native-material',
      pointer: '/node/parameters/value',
      expected: 'A',
      ...basis,
    },
    {
      kind: 'unsupported',
      limitation: 'verification',
      nodeIds: ['b'],
      ...basis,
      reason:
        'The supplied contract cannot prove the explicitly requested external guarantee for B.',
    },
  ],
  ['a', 'b'],
  [],
  [
    { nodeId: 'a', output: 'main' },
    { nodeId: 'b', output: 'main' },
  ],
  'delivery-partial',
);
assert.equal(partial.inspection.status, 'partial');
assert.deepEqual(
  partial.runnable.map((part) => part.nodeIds),
  [['a']],
);
const success = await execute(partial.runnable[0].result.workflow);
assert.equal(success.status, 'success');
const successRuns = success.data.resultData.runData;
assert.equal(successRuns.a[0].data.main[0][0].json.value, 'A');
assert.equal(successRuns.b, undefined);
assert.deepEqual(partial.drafts[0].nativeNodes[0].parameters, { value: 'B' });

const message = 'Required source price is missing.';
const stop = createN8nNativeCapabilities().find(
  (capability) => capability.name === 'stop-and-error',
);
const errorSource = {
  ...source,
  capabilities: [context, stop],
  nativeNodes: [
    source.nativeNodes[0],
    { id: 'stop', capability: stop.name, parameters: { message } },
  ],
};
const failing = compile(
  errorSource,
  [
    { kind: 'precedence', before: 'a', after: 'stop', ...basis },
    {
      kind: 'material-value',
      nodeId: 'stop',
      materialKind: 'native-material',
      pointer: '/node/parameters/message',
      expected: message,
      ...basis,
    },
  ],
  ['a'],
  [{ from: 'a', output: 'main', to: 'stop', input: 'main' }],
  [],
  'delivery-stop',
);
assert.equal(failing.inspection.status, 'complete');
const failure = await execute(failing.runnable[0].result.workflow);
assert.equal(failure.status, 'error');
assert.equal(failure.data.resultData.runData.stop[0].error.message, message);

const dependent = compile(
  source,
  [
    {
      kind: 'unsupported',
      limitation: 'verification',
      nodeIds: ['b'],
      ...basis,
      reason: 'Missing required external guarantee.',
    },
  ],
  ['b'],
  [{ from: 'b', output: 'main', to: 'a', input: 'main' }],
  [{ nodeId: 'a', output: 'main' }],
  'delivery-dependent',
);
assert.equal(dependent.inspection.status, 'draft');
assert.equal(dependent.runnable.length, 0);
const summary = {
  image,
  scope:
    'Unpublished source; synthetic values only; no live model or business API.',
  partial: {
    status: success.status,
    outputValue: 'A',
    unsupportedNodeExecuted: false,
    preservedDrafts: partial.drafts.length,
  },
  stop: { status: failure.status, exactErrorMessagePreserved: true },
  dependent: {
    runnableCount: 0,
    actualEdgesPreserved: dependent.drafts[0].edges.length,
  },
};
await writeFile(
  new URL('summary.json', output),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary));
