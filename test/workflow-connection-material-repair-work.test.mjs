import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import {
  describeWorkflowConnectionGoals,
  describeWorkflowConnectionMaterialRepairWork,
  validateWorkflowConnectionSourceRepairRequest,
  applyWorkflowConnectionMaterialRepair,
  replayWorkflowConnectionMaterialRepair,
  selectWorkflowConnectionArgumentValues,
  applyWorkflowConnectionMaterialRepairWork,
} from '@openapi-flow/core';
import {
  generateApiArguments,
  planWorkflowConnectionGoalRecovery,
} from '@openapi-flow/langchain';
import {
  initialConnectionRecoveryFixture,
  initialGoalRejection,
  recoveryQueueModel,
} from './fixtures/initial-connection-recovery-fixture.mjs';

const { Ajv2020 } = createRequire(import.meta.resolve('@openapi-flow/core'))(
  'ajv/dist/2020.js',
);

test('API repair stages use the actual OAS ownership: no-input calls and fully bound literal stages are not choices', () => {
  const { broken, receipt } = initialConnectionRecoveryFixture();
  const stages = describeWorkflowConnectionGoals(broken).materialRepairStages;
  assert.deepEqual(
    stages.find((stage) => stage.stage === 'api-arguments').nodeIds,
    [],
  );
  const bindingIds = stages.find(
    (stage) => stage.stage === 'api-bindings',
  ).nodeIds;
  assert.equal(bindingIds.includes('source'), false);
  assert.equal(bindingIds.includes('price'), true);
  for (const target of [
    { stage: 'api-bindings', nodeId: 'source' },
    { stage: 'api-arguments', nodeId: 'price' },
  ])
    assert.throws(
      () =>
        validateWorkflowConnectionSourceRepairRequest({
          source: broken,
          request: {
            ...receipt,
            request: { ...receipt.request, targets: [target] },
          },
        }),
      /no editable OAS inputs/,
    );
  assert.doesNotThrow(() =>
    validateWorkflowConnectionSourceRepairRequest({
      source: broken,
      request: {
        ...receipt,
        request: {
          ...receipt.request,
          targets: [
            { stage: 'api-bindings', nodeId: 'price' },
            { stage: 'api-arguments', nodeId: 'price' },
          ],
        },
      },
    }),
  );
});

test('the model schema offers the same actual stage choices before initial recovery, not a prompt-only instruction', async () => {
  const fixture = initialConnectionRecoveryFixture();
  const rejection = await initialGoalRejection(fixture.broken, fixture.goals);
  const model = recoveryQueueModel(
    [{ decision: fixture.request }],
    ({ schema }) => {
      const validate = new Ajv2020({ strict: false }).compile(schema);
      assert.equal(validate({ decision: fixture.request }), true);
      for (const target of [
        { stage: 'api-bindings', nodeId: 'source' },
        { stage: 'api-arguments', nodeId: 'price' },
        { stage: 'api-bindings', nodeId: 'unknown' },
      ])
        assert.equal(
          validate({ decision: { ...fixture.request, targets: [target] } }),
          false,
        );
    },
  );
  const result = await planWorkflowConnectionGoalRecovery({
    ...fixture.broken,
    model,
    rejectedProposals: [rejection],
  });
  assert.deepEqual(result.request, fixture.request);
  assert.equal(model.requests.length, 1);
});

test('newly unbound fields produce typed dependent work from actual OAS while original requests, source and values remain unchanged', async () => {
  const { broken, receipt, replacement } = initialConnectionRecoveryFixture();
  broken.scenario += ' Use the price identifier "request-only-7".';
  receipt.sourceFingerprint =
    describeWorkflowConnectionGoals(broken).sourceFingerprint;
  replacement.apiArguments[0].bindings =
    replacement.apiArguments[0].bindings.filter(
      (binding) => binding.targetPointer !== '/query/id',
    );
  const before = globalThis.structuredClone({
    ...broken,
    capabilities: undefined,
  });
  const originalReplacement = globalThis.structuredClone(replacement);
  const work = describeWorkflowConnectionMaterialRepairWork({
    source: broken,
    request: receipt,
    replacement,
  });
  assert.deepEqual(work.originalRequest, receipt);
  assert.deepEqual(work.request.request.targets, [
    { stage: 'api-bindings', nodeId: 'price' },
    { stage: 'api-arguments', nodeId: 'price' },
  ]);
  assert.equal(work.apiArgumentTasks.length, 1);
  const [task] = work.apiArgumentTasks;
  assert.equal(task.input.scenario, broken.scenario);
  assert.deepEqual(
    task.input.operation,
    broken.materials.find((material) => material.arguments.callId === 'price')
      .operation,
  );
  const query = task.literalInputSchema.properties.values.properties.query;
  assert.deepEqual(Object.keys(query.properties), ['id']);
  assert.equal(query.properties.id.type, 'string');
  const model = recoveryQueueModel([
    {
      literalInputs: {
        state: 'provided',
        values: { query: { id: 'request-only-7' } },
        literalSources: [
          {
            targetPointer: '/query/id',
            sourceFormat: 'json',
            sourceText: '"request-only-7"',
          },
        ],
      },
      requestedInputs: ['/query/id'],
    },
  ]);
  const generated = await generateApiArguments({
    ...task.input,
    model,
    trackRequestedInputs: true,
  });
  const finalReplacement = {
    ...replacement,
    apiArguments: [
      {
        callId: generated.callId,
        ...selectWorkflowConnectionArgumentValues(generated),
      },
    ],
  };
  assert.throws(
    () =>
      applyWorkflowConnectionMaterialRepair({
        source: broken,
        request: receipt,
        replacement: finalReplacement,
      }),
    /cannot change literal/,
  );
  const adopted = applyWorkflowConnectionMaterialRepairWork({
    source: broken,
    work,
    pendingReplacement: replacement,
    replacement: finalReplacement,
  });
  assert.deepEqual(
    adopted.source.materials.find(
      (material) => material.arguments.callId === 'price',
    ).arguments.values,
    { query: { id: 'request-only-7' } },
  );
  assert.equal(model.requests.length, 1);
  assert.deepEqual(adopted.receipt.workSource.request, receipt);
  for (const field of ['replacementFingerprint', 'apiArgumentTasks']) {
    const changed = globalThis.structuredClone(work);
    changed[field] = field === 'apiArgumentTasks' ? [] : 'b'.repeat(64);
    assert.throws(
      () =>
        applyWorkflowConnectionMaterialRepairWork({
          source: broken,
          work: changed,
          pendingReplacement: replacement,
          replacement: finalReplacement,
        }),
      /differs/,
    );
  }
  const rebound = globalThis.structuredClone(finalReplacement);
  rebound.apiArguments[0].bindings[0].sourceNodeId = 'detail';
  assert.throws(
    () =>
      applyWorkflowConnectionMaterialRepairWork({
        source: broken,
        work,
        pendingReplacement: replacement,
        replacement: rebound,
      }),
    /cannot change its pending bindings/,
  );
  const missingWork = {
    source: broken,
    pendingReplacement: replacement,
    replacement: finalReplacement,
  };
  assert.throws(
    () => applyWorkflowConnectionMaterialRepairWork(missingWork),
    /work.originalRequest is required/,
  );
  const changedProof = globalThis.structuredClone(adopted.receipt);
  changedProof.workSource.request.sourceFingerprint = 'c'.repeat(64);
  assert.throws(
    () =>
      replayWorkflowConnectionMaterialRepair({
        source: broken,
        receipt: changedProof,
      }),
    /different source/,
  );
  assert.deepEqual(
    replayWorkflowConnectionMaterialRepair({
      source: broken,
      receipt: adopted.receipt,
    }).materials,
    adopted.source.materials,
  );
  assert.deepEqual({ ...broken, capabilities: undefined }, before);
  assert.deepEqual(replacement, originalReplacement);
});

test('a producer change or declaration reorder does not schedule a redundant literal call; explicit literal work still uses its original contract', () => {
  const { broken, receipt, replacement } = initialConnectionRecoveryFixture();
  const work = describeWorkflowConnectionMaterialRepairWork({
    source: broken,
    request: receipt,
    replacement,
  });
  assert.deepEqual(work.apiArgumentTasks, []);
  assert.deepEqual(work.request, receipt);
  const reordered = globalThis.structuredClone(replacement);
  reordered.apiArguments[0].bindings.reverse();
  assert.deepEqual(
    describeWorkflowConnectionMaterialRepairWork({
      source: broken,
      request: receipt,
      replacement: reordered,
    }).apiArgumentTasks,
    [],
  );
  const original = broken.materials.find(
    (material) => material.arguments.callId === 'price',
  ).arguments;
  original.bindings = original.bindings.filter(
    (binding) => binding.targetPointer !== '/query/labels',
  );
  original.values = { query: { labels: ['kept'] } };
  const explicit = {
    ...receipt,
    sourceFingerprint:
      describeWorkflowConnectionGoals(broken).sourceFingerprint,
    request: {
      ...receipt.request,
      targets: [{ stage: 'api-arguments', nodeId: 'price' }],
    },
  };
  const pending = {
    apiArguments: [
      {
        callId: original.callId,
        ...selectWorkflowConnectionArgumentValues(original),
      },
    ],
    nativeNodes: [],
  };
  const planned = describeWorkflowConnectionMaterialRepairWork({
    source: broken,
    request: explicit,
    replacement: pending,
  });
  assert.equal(planned.apiArgumentTasks.length, 1);
  assert.deepEqual(planned.request.request.targets, explicit.request.targets);
});

test('work description validates original permissions and does not repair stale requests, invalid pending values or unknown targets', () => {
  const { broken, receipt, replacement } = initialConnectionRecoveryFixture();
  for (const input of [
    {
      source: broken,
      request: { ...receipt, sourceFingerprint: 'a'.repeat(64) },
      replacement,
    },
    {
      source: broken,
      request: receipt,
      replacement: { ...replacement, apiArguments: [] },
    },
    {
      source: broken,
      request: receipt,
      replacement: {
        ...replacement,
        apiArguments: [
          { ...replacement.apiArguments[0], values: { query: { id: 8 } } },
        ],
      },
    },
  ])
    assert.throws(() => describeWorkflowConnectionMaterialRepairWork(input));
});
