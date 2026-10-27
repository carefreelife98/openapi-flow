import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyWorkflowConnectionMaterialRepair,
  replayWorkflowConnectionMaterialRepair,
  describeWorkflowConnectionGoals,
  describeWorkflowConnectionConflictMaterials,
  selectWorkflowConnectionArgumentValues,
  inspectWorkflowConnectionMaterialRepairInputs,
  collectDeferredApiInputSlots,
} from '@openapi-flow/core';
import { initialConnectionRecoveryFixture } from './fixtures/initial-connection-recovery-fixture.mjs';

test('initial material replacement keeps OAS/requirements/roles and unrelated data, then replays its exact source-bound receipt', () => {
  const { broken, receipt, replacement, source } =
    initialConnectionRecoveryFixture();
  const original = globalThis.structuredClone({
    ...broken,
    capabilities: undefined,
  });
  const result = applyWorkflowConnectionMaterialRepair({
    source: broken,
    request: receipt,
    replacement,
  });
  assert.deepEqual(result.source.materials, source.materials);
  assert.deepEqual(result.source.requirements, broken.requirements);
  assert.deepEqual(
    replayWorkflowConnectionMaterialRepair({
      source: broken,
      receipt: result.receipt,
    }).materials,
    result.source.materials,
  );
  assert.deepEqual({ ...broken, capabilities: undefined }, original);
  result.source.requirements[0].text = 'Changed returned copy';
  assert.deepEqual({ ...broken, capabilities: undefined }, original);
});

test('requests, replacement targets, field ownership, unknown keys and no-progress cannot silently change or fill missing material', () => {
  const { broken, receipt, replacement } = initialConnectionRecoveryFixture();
  const cases = [
    { request: { ...receipt, sourceFingerprint: 'a'.repeat(64) }, replacement },
    { request: receipt, replacement: { ...replacement, apiArguments: [] } },
    {
      request: receipt,
      replacement: {
        ...replacement,
        apiArguments: [
          ...replacement.apiArguments,
          ...replacement.apiArguments,
        ],
      },
    },
    { request: receipt, replacement: { ...replacement, unrelated: true } },
    {
      request: receipt,
      replacement: {
        apiArguments: [{ ...replacement.apiArguments[0], callId: 'unknown' }],
        nativeNodes: [],
      },
    },
    {
      request: receipt,
      replacement: {
        apiArguments: [
          {
            ...replacement.apiArguments[0],
            values: { query: { invented: 7 } },
          },
        ],
        nativeNodes: [],
      },
    },
    {
      request: receipt,
      replacement: {
        apiArguments: [
          { ...replacement.apiArguments[0], requestMediaType: 'text/plain' },
        ],
        nativeNodes: [],
      },
    },
    {
      request: {
        ...receipt,
        request: {
          ...receipt.request,
          targets: [{ stage: 'api-arguments', nodeId: 'price' }],
        },
      },
      replacement,
    },
    {
      request: receipt,
      replacement: {
        apiArguments: [
          broken.materials.find((item) => item.arguments.callId === 'price')
            .arguments,
        ],
        nativeNodes: [],
      },
    },
  ];
  for (const input of cases)
    assert.throws(() =>
      applyWorkflowConnectionMaterialRepair({ source: broken, ...input }),
    );
});

test('saved replacement receipts are checked against actual OAS/data and cannot claim a different resulting source', () => {
  const { broken, receipt, replacement } = initialConnectionRecoveryFixture();
  const result = applyWorkflowConnectionMaterialRepair({
    source: broken,
    request: receipt,
    replacement,
  });
  const changed = globalThis.structuredClone(result.receipt);
  changed.afterSourceFingerprint = 'b'.repeat(64);
  assert.throws(
    () =>
      replayWorkflowConnectionMaterialRepair({
        source: broken,
        receipt: changed,
      }),
    /differs/,
  );
  const next = { ...broken, scenario: 'A new scenario' };
  assert.throws(
    () =>
      replayWorkflowConnectionMaterialRepair({
        source: next,
        receipt: result.receipt,
      }),
    /different source/,
  );
});

test('reordering binding declarations is not execution progress and does not mutate their original order', () => {
  const { broken, receipt } = initialConnectionRecoveryFixture();
  const original = broken.materials.find(
    (item) => item.arguments.callId === 'price',
  ).arguments;
  const before = globalThis.structuredClone(original);
  assert.ok(original.bindings.length > 1);
  assert.throws(
    () =>
      applyWorkflowConnectionMaterialRepair({
        source: broken,
        request: receipt,
        replacement: {
          apiArguments: [
            {
              callId: original.callId,
              ...selectWorkflowConnectionArgumentValues(original),
              bindings: [...original.bindings].reverse(),
            },
          ],
          nativeNodes: [],
        },
      }),
    /no execution-material progress/,
  );
  assert.deepEqual(original, before);
});

test('a literal array order change is an actual API-arguments repair, not an unordered declaration', () => {
  const { broken, receipt } = initialConnectionRecoveryFixture();
  const original = broken.materials.find(
    (item) => item.arguments.callId === 'price',
  ).arguments;
  original.bindings = original.bindings.filter(
    (binding) => binding.targetPointer !== '/query/labels',
  );
  original.values = { query: { labels: ['first', 'second'] } };
  const result = applyWorkflowConnectionMaterialRepair({
    source: broken,
    request: {
      ...receipt,
      sourceFingerprint:
        describeWorkflowConnectionGoals(broken).sourceFingerprint,
      request: {
        ...receipt.request,
        targets: [{ stage: 'api-arguments', nodeId: 'price' }],
      },
    },
    replacement: {
      apiArguments: [
        {
          callId: original.callId,
          ...selectWorkflowConnectionArgumentValues(original),
          values: { query: { labels: ['second', 'first'] } },
        },
      ],
      nativeNodes: [],
    },
  });
  assert.deepEqual(
    result.source.materials.find((item) => item.arguments.callId === 'price')
      .arguments.values.query.labels,
    ['second', 'first'],
  );
  assert.deepEqual(original.values.query.labels, ['first', 'second']);
});

test('conflict context includes exact target mappings and transitive producer contracts without runtime callbacks', () => {
  const { broken } = initialConnectionRecoveryFixture();
  const context = describeWorkflowConnectionConflictMaterials({
    source: broken,
    nodeIds: ['price'],
  });
  assert.ok(
    context.apiCalls.some(
      (item) =>
        item.callId === 'price' &&
        item.arguments.bindings[0].sourceNodeId === 'detail',
    ),
  );
  assert.ok(
    context.apiResponseContracts.some((item) => item.nodeId === 'detail'),
  );
  assert.ok(
    context.apiResponseContracts.some((item) => item.nodeId === 'source'),
  );
  assert.ok(
    context.apiCalls.find((item) => item.callId === 'price').requestSchema,
  );
  assert.equal(JSON.stringify(context).includes('withStructuredOutput'), false);
  for (const nodeIds of [[], ['missing'], ['price', 'price']])
    assert.throws(() =>
      describeWorkflowConnectionConflictMaterials({ source: broken, nodeIds }),
    );
  assert.equal(
    describeWorkflowConnectionGoals(broken).sourceFingerprint.length,
    64,
  );
});

test('binding removal exposes actual OAS input slots before adoption; only explicit host authorization permits missing values', () => {
  const { broken, receipt, replacement } = initialConnectionRecoveryFixture();
  replacement.apiArguments[0].bindings =
    replacement.apiArguments[0].bindings.filter(
      (binding) => binding.targetPointer !== '/query/id',
    );
  const input = { source: broken, request: receipt, replacement };
  const snapshot = globalThis.structuredClone({
    ...broken,
    capabilities: undefined,
  });
  const inspection = inspectWorkflowConnectionMaterialRepairInputs(input);
  assert.equal(inspection.slots.length, 1);
  const [slot] = inspection.slots;
  assert.equal(slot.callId, 'price');
  assert.equal(slot.targetPointer, '/query/id');
  assert.deepEqual(inspection.unapprovedSlots, inspection.slots);
  assert.deepEqual(inspection.retainedDeferredApiInputIds, []);
  assert.deepEqual(inspection.retiredDeferredApiInputIds, []);
  assert.throws(
    () => applyWorkflowConnectionMaterialRepair(input),
    /explicitly defer current slot/,
  );
  const authorized = {
    ...replacement,
    deferredApiInputIds: [slot.id],
  };
  const approved = inspectWorkflowConnectionMaterialRepairInputs({
    ...input,
    replacement: authorized,
  });
  assert.deepEqual(approved.unapprovedSlots, []);
  assert.notEqual(
    approved.replacementFingerprint,
    inspection.replacementFingerprint,
  );
  const result = applyWorkflowConnectionMaterialRepair({
    ...input,
    replacement: authorized,
  });
  assert.deepEqual(result.source.deferredApiInputIds, [slot.id]);
  assert.deepEqual(
    result.source.materials.find((item) => item.arguments.callId === 'price')
      .arguments.values,
    {},
  );
  assert.equal(
    describeWorkflowConnectionGoals(result.source).context.deferredApiInputs[0]
      .id,
    slot.id,
  );
  assert.deepEqual(
    replayWorkflowConnectionMaterialRepair({
      source: broken,
      receipt: result.receipt,
    }).materials,
    result.source.materials,
  );
  assert.deepEqual({ ...broken, capabilities: undefined }, snapshot);
  inspection.slots[0].schema = false;
  assert.notDeepEqual(
    inspectWorkflowConnectionMaterialRepairInputs(input).slots[0].schema,
    false,
  );
  for (const ids of [[], [slot.id, slot.id], ['unknown'], [slot.id, 'unknown']])
    assert.throws(() =>
      applyWorkflowConnectionMaterialRepair({
        ...input,
        replacement: { ...replacement, deferredApiInputIds: ids },
      }),
    );
  const alteredReceipt = globalThis.structuredClone(result.receipt);
  alteredReceipt.replacement.deferredApiInputIds = [];
  assert.throws(() =>
    replayWorkflowConnectionMaterialRepair({
      source: broken,
      receipt: alteredReceipt,
    }),
  );
});

test('resolved slots require explicit retirement and unrelated APIs keep their existing host input policy', () => {
  const { broken, receipt, replacement } = initialConnectionRecoveryFixture();
  const oldPrice = broken.materials.find(
    (item) => item.arguments.callId === 'price',
  );
  oldPrice.arguments.bindings = oldPrice.arguments.bindings.filter(
    (item) => item.targetPointer !== '/query/id',
  );
  const unrelated = broken.materials.find(
    (item) => item.arguments.callId === 'detail',
  );
  unrelated.arguments.bindings = unrelated.arguments.bindings.filter(
    (item) => item.targetPointer !== '/path/id',
  );
  const previousSlots = collectDeferredApiInputSlots({
    materials: [oldPrice, unrelated].map((material) => ({
      operation: material.operation,
      ...material.arguments,
    })),
  });
  broken.deferredApiInputIds = previousSlots.map((slot) => slot.id);
  const request = {
    ...receipt,
    sourceFingerprint:
      describeWorkflowConnectionGoals(broken).sourceFingerprint,
  };
  const input = { source: broken, request, replacement };
  const inspection = inspectWorkflowConnectionMaterialRepairInputs(input);
  const retained = previousSlots.find((slot) => slot.callId === 'detail');
  const retired = previousSlots.find((slot) => slot.callId === 'price');
  assert.ok(retained && retired);
  assert.deepEqual(inspection.retiredDeferredApiInputIds, [retired.id]);
  assert.deepEqual(inspection.retainedDeferredApiInputIds, [retained.id]);
  assert.throws(
    () => applyWorkflowConnectionMaterialRepair(input),
    /stale slot/,
  );
  const result = applyWorkflowConnectionMaterialRepair({
    ...input,
    replacement: { ...replacement, deferredApiInputIds: [retained.id] },
  });
  assert.deepEqual(result.source.deferredApiInputIds, [retained.id]);
  assert.throws(
    () =>
      applyWorkflowConnectionMaterialRepair({
        ...input,
        replacement: { ...replacement, deferredApiInputIds: [] },
      }),
    /unrelated API input deferral/,
  );
});

test('optional empty requested-input metadata is not execution progress; actual requested paths remain significant', () => {
  const { broken, receipt } = initialConnectionRecoveryFixture();
  const original = broken.materials.find(
    (material) => material.arguments.callId === 'price',
  ).arguments;
  original.bindings = original.bindings.filter(
    (binding) => binding.targetPointer !== '/query/labels',
  );
  original.values = { query: { labels: ['first', 'second'] } };
  const request = {
    ...receipt,
    request: {
      ...receipt.request,
      targets: [{ stage: 'api-arguments', nodeId: original.callId }],
    },
  };
  const result = {
    apiArguments: [
      {
        callId: original.callId,
        ...selectWorkflowConnectionArgumentValues(original),
        requestedInputs: [],
      },
    ],
    nativeNodes: [],
  };
  delete original.requestedInputs;
  request.sourceFingerprint =
    describeWorkflowConnectionGoals(broken).sourceFingerprint;
  assert.throws(
    () =>
      applyWorkflowConnectionMaterialRepair({
        source: broken,
        request,
        replacement: result,
      }),
    /no execution-material progress/,
  );
  result.apiArguments[0].requestedInputs = ['/query/id'];
  const applied = applyWorkflowConnectionMaterialRepair({
    source: broken,
    request,
    replacement: result,
  });
  assert.deepEqual(
    applied.source.materials.find(
      (material) => material.arguments.callId === 'price',
    ).arguments.requestedInputs,
    ['/query/id'],
  );
  assert.equal(Object.hasOwn(original, 'requestedInputs'), false);
});
