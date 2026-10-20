import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  resolveWorkflowDraftNativeSnapshot,
  resolveNativeMaterialSnapshot,
  validateApiBindingAssignments,
  stageWorkflowDraftEdit,
} from '@openapi-flow/core';
import { compileN8nWorkflowTemplate } from '@openapi-flow/n8n';
import {
  nativeMaterialRevisionFixture,
  repairNativeMaterialRevision,
} from './fixtures/native-material-revision-fixture.mjs';
const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('material snapshots name missing boundary inputs rather than defaulting source collections', () => {
  const input = {
    apiMaterials: [],
    nativeOutputs: [],
    nativeNodes: [],
    capabilities: [],
    deferredNodeIds: [],
  };
  for (const field of Object.keys(input)) {
    const missing = { ...input };
    delete missing[field];
    assert.throws(
      () => resolveNativeMaterialSnapshot(missing),
      new RegExp(`snapshot\\.${field} must be an explicit array`),
    );
  }
  assert.throws(
    () => resolveNativeMaterialSnapshot({ ...input, shouldDeferNode: 'all' }),
    /snapshot.shouldDeferNode must be a function/,
  );
  assert.throws(
    () =>
      resolveNativeMaterialSnapshot({ ...input, capabilities: [{ name: '' }] }),
    /snapshot.capabilities must have non-empty names/,
  );
});

for (const replacement of ['/same-path', '/after']) {
  test(`actual material snapshots follow ${replacement} without old-contract fallback and cascade explicit consumer repairs`, async () => {
    const input = await nativeMaterialRevisionFixture(replacement);
    const original = globalThis.structuredClone(input.draft);
    const initial = stageWorkflowDraftEdit(input);
    assert.deepEqual(
      initial.pendingRepairs.map((task) => task.nodeId),
      ['api-items'],
    );
    const before = resolveWorkflowDraftNativeSnapshot({
      content: input.draft,
      context: input.context,
      deferredNodeIds: [],
      unavailableApiNodeIds: [],
    });
    assert.equal(before.status, 'ready');
    const repaired = repairNativeMaterialRevision(input);
    const after = resolveWorkflowDraftNativeSnapshot({
      content: repaired.candidate.draft,
      context: input.context,
      deferredNodeIds: [],
      unavailableApiNodeIds: [],
    });
    assert.equal(after.status, 'ready');
    assert.deepEqual(repaired.candidate.draft.edges, original.edges);
    assert.deepEqual(
      repaired.candidate.draft.apiCalls.slice(1),
      original.apiCalls.slice(1),
    );
    assert.deepEqual(input.draft, original);
    assert.notDeepEqual(
      before.outputs.find((output) => output.nodeId === 'values'),
      after.outputs.find((output) => output.nodeId === 'values'),
    );
    const probe = {
      materials: [
        {
          callId: 'probe',
          operation: input.numberOnly,
          requestMediaType: 'application/json',
        },
      ],
      calls: [
        {
          callId: 'probe',
          bindings: [
            {
              kind: 'node-output',
              sourceNodeId: 'values',
              sourcePointer: '/item',
              targetPointer: '/body/value',
            },
          ],
        },
      ],
    };
    const validateBefore = new Ajv2020({ strict: false }).compile(
      before.outputs.find((output) => output.nodeId === 'values').schema,
    );
    const validateAfter = new Ajv2020({ strict: false }).compile(
      after.outputs.find((output) => output.nodeId === 'values').schema,
    );
    assert.equal(validateBefore({ item: 'same' }), true);
    assert.equal(validateBefore({ item: 7 }), false);
    assert.equal(validateAfter({ item: 'same' }), false);
    assert.equal(validateAfter({ item: 7 }), true);
    validateApiBindingAssignments({ ...probe, nativeOutputs: after.outputs });
    const tasks = repaired.stages.flatMap((stage) =>
      stage.pendingRepairs.map((task) => task.nodeId),
    );
    for (const id of ['api-items', 'values', 'joined', 'first', 'second'])
      assert.ok(tasks.includes(id), id);
    const compiled = compileN8nWorkflowTemplate({
      draft: repaired.candidate.draft,
      context: input.context,
      name: 'Current actual material revision',
      deployments: [
        {
          documentId: input.replacement.key.documentId,
          baseUrl: 'https://contract.example.test',
        },
      ],
    });
    assert.equal(compiled.triggerConnected, true);
    assert.equal(compiled.inputSlots.length, 0);
    assert.ok(
      compiled.workflow.nodes.some(
        (node) => node.type === 'n8n-nodes-base.splitOut',
      ),
    );
  });
}

test('a pending native reference has no old output and blocks only dependent material contracts', async () => {
  const input = await nativeMaterialRevisionFixture();
  const snapshot = resolveNativeMaterialSnapshot({
    apiMaterials: [
      { callId: 'source', operation: input.replacement },
      ...input.draft.apiCalls.slice(1).map((call) => ({
        callId: call.id,
        operation: input.context.operations.find(
          (operation) =>
            operation.key.operationRef === call.operation.operationRef,
        ),
      })),
    ],
    nativeOutputs: [],
    nativeNodes: input.draft.nativeNodes,
    capabilities: input.context.capabilities,
    deferredNodeIds: ['api-items'],
  });
  assert.equal(snapshot.status, 'pending');
  assert.equal(Object.hasOwn(snapshot, 'capabilities'), false);
  assert.ok(
    !snapshot.outputs.some((output) =>
      ['api-items', 'values', 'joined'].includes(output.nodeId),
    ),
  );
  assert.ok(snapshot.outputs.some((output) => output.nodeId === 'collected'));
});

test('material binding rejects an inconsistent definition instead of silently restoring its previous compiler', async () => {
  const input = await nativeMaterialRevisionFixture();
  const original = input.context.capabilities.find(
    (capability) => capability.name === 'split-api-response-array',
  );
  input.context.capabilities = input.context.capabilities.map((capability) =>
    capability === original
      ? {
          ...capability,
          compile: () => {
            throw new Error('Different implementation');
          },
        }
      : capability,
  );
  assert.throws(
    () =>
      resolveWorkflowDraftNativeSnapshot({
        content: input.draft,
        context: input.context,
        deferredNodeIds: [],
        unavailableApiNodeIds: [],
      }),
    /material definition.*changed compile.*coherent bindMaterialContracts/,
  );
});

test('new material binding leaves the original definitions and their captured contracts unchanged', async () => {
  const input = await nativeMaterialRevisionFixture();
  const receipts = input.context.capabilities.map((capability) =>
    globalThis.structuredClone(capability.materialSources),
  );
  const repaired = repairNativeMaterialRevision(input);
  const bound = resolveWorkflowDraftNativeSnapshot({
    content: repaired.candidate.draft,
    context: input.context,
    deferredNodeIds: [],
    unavailableApiNodeIds: [],
  });
  assert.equal(bound.status, 'ready');
  assert.deepEqual(
    input.context.capabilities.map((capability) => capability.materialSources),
    receipts,
  );
  const original = resolveWorkflowDraftNativeSnapshot({
    content: input.draft,
    context: input.context,
    deferredNodeIds: [],
    unavailableApiNodeIds: [],
  });
  assert.equal(original.status, 'ready');
  assert.notDeepEqual(original.outputs, bound.outputs);
});

test('unavailable API contracts never revive captured native output schemas', async () => {
  const input = await nativeMaterialRevisionFixture();
  const snapshot = resolveWorkflowDraftNativeSnapshot({
    content: input.draft,
    context: input.context,
    deferredNodeIds: [],
    unavailableApiNodeIds: ['source'],
  });
  assert.equal(snapshot.status, 'pending');
  assert.ok(
    !snapshot.outputs.some((output) =>
      ['api-items', 'values', 'joined'].includes(output.nodeId),
    ),
  );
  assert.ok(
    snapshot.pending.some(
      (pending) =>
        pending.nodeId === 'api-items' &&
        pending.sourceNodeIds.includes('source'),
    ),
  );
});

test('a final registry cannot return stale source receipts after all producers become available', async () => {
  const input = await nativeMaterialRevisionFixture();
  const repaired = repairNativeMaterialRevision(input);
  const original = input.context.capabilities.find(
    (capability) => capability.name === 'split-api-response-array',
  );
  const stale = {
    ...original,
    bindMaterialContracts: (sources) => {
      const bound = original.bindMaterialContracts(sources);
      return sources.nativeOutputs.some((output) => output.nodeId === 'joined')
        ? { ...bound, materialSources: original.materialSources }
        : bound;
    },
  };
  const context = {
    ...input.context,
    capabilities: input.context.capabilities.map((capability) =>
      capability === original ? stale : capability,
    ),
  };
  assert.throws(
    () =>
      resolveWorkflowDraftNativeSnapshot({
        content: repaired.candidate.draft,
        context,
        deferredNodeIds: [],
        unavailableApiNodeIds: [],
      }),
    /API source source does not match the current material contract/,
  );
});
