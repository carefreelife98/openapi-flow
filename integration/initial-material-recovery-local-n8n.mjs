import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';
import { MemorySaver } from '@langchain/langgraph';
import { createIncrementalWorkflowConnectionGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  replayWorkflowConnectionMaterialRepair,
  describeWorkflowConnectionGoals,
  inspectWorkflowConnectionMaterialRepairInputs,
  createWorkflowDraft,
  describeWorkflowConnectionMaterialRepairWork,
  selectWorkflowConnectionArgumentValues,
} from '@openapi-flow/core';
import { generateApiArguments } from '@openapi-flow/langchain';
import {
  compilePlannedN8nWorkflow,
  createHttpRequestNode,
  compileN8nWorkflowTemplate,
} from '@openapi-flow/n8n';
import {
  initialConnectionRecoveryFixture,
  recoveryQueueModel,
} from '../test/fixtures/initial-connection-recovery-fixture.mjs';
import {
  incrementalConnectionPatch,
  incrementalConnectionModelPatch,
} from '../test/fixtures/incremental-connection-fixture.mjs';
import { createFiveApiDagRuntime } from './fixtures/five-api-dag-runtime.mjs';
import { connectionGoalReviewOutput } from '../test/fixtures/connection-goal-review-fixture.mjs';
import {
  connectionOutlineFixture,
  connectionOutlineProposal,
} from '../test/fixtures/connection-outline-fixture.mjs';

// Deterministic failing input/decisions prove host scheduling and SDK/engine behavior, not model quality.
const fixture = initialConnectionRecoveryFixture(),
  runId = randomUUID();
const withGoalReview = process.argv.includes('--with-goal-review');
const withDeferredApiInput = process.argv.includes('--with-deferred-api-input');
const withArgumentWork = process.argv.includes('--with-argument-work');
const checkpointArguments = process.argv.includes('--checkpoint-argument-work');
if (checkpointArguments && !withArgumentWork)
  throw new Error('--checkpoint-argument-work requires --with-argument-work');
const withOutline = process.argv.includes('--with-outline');
const rejectOutline = process.argv.includes('--reject-outline');
if (rejectOutline && !withOutline)
  throw new Error('--reject-outline requires --with-outline');
if (withArgumentWork && !withDeferredApiInput)
  throw new Error(
    '--with-argument-work requires the explicit --with-deferred-api-input test-host policy',
  );
if (withDeferredApiInput)
  fixture.replacement.apiArguments[0].bindings =
    fixture.replacement.apiArguments[0].bindings.filter(
      (binding) => binding.targetPointer !== '/query/id',
    );
const directory = new URL(
  `../.local-artifacts/initial-material-recovery/${runId}/`,
  import.meta.url,
);
await mkdir(directory, { recursive: true });
const originalFingerprint = describeWorkflowConnectionGoals(
  fixture.broken,
).sourceFingerprint;
const model = recoveryQueueModel([
  {
    goals: withGoalReview
      ? fixture.goals.filter((goal) => goal.kind !== 'independent')
      : fixture.goals,
  },
  ...(withGoalReview
    ? [({ payload }) => connectionGoalReviewOutput(payload, 'contradicted')]
    : []),
  { decision: fixture.request },
  ...(withArgumentWork
    ? [{ literalInputs: { state: 'not-provided' }, requestedInputs: [] }]
    : []),
  { goals: fixture.goals },
  ...(withGoalReview
    ? [({ payload }) => connectionGoalReviewOutput(payload)]
    : []),
  ...(withOutline
    ? [
        ...(rejectOutline
          ? [
              ({ payload }) => {
                const rejected = connectionOutlineProposal(payload);
                rejected.bundles.forEach((bundle) => {
                  bundle.goalIds = [];
                });
                return rejected;
              },
            ]
          : []),
        ({ payload }) => connectionOutlineProposal(payload),
        ...connectionOutlineFixture().modelPatches,
      ]
    : [
        {
          decision: incrementalConnectionModelPatch(
            fixture.source,
            incrementalConnectionPatch({
              addEdges: fixture.plan.edges,
              addRootNodeIds: ['source'],
              addTerminals: [{ nodeId: 'summary', output: 'main' }],
            }),
          ),
        },
      ]),
]);
const progress = [];
const argumentProgress = [];
const argumentNotificationFailure = new Error(
  'Saved API argument notification interrupted',
);
let argumentNotificationFailed = false;
let callbacks = 0;
let selectedBundle = 0;
const graph = createIncrementalWorkflowConnectionGraph({
  source: () => fixture.broken,
  model,
  ...(withGoalReview ? { initialGoalReview: { model } } : {}),
  ...(withOutline
    ? {
        outlinePlanning: {
          model,
          selectBundle: ({ outline }) => outline.bundles[selectedBundle++].id,
        },
      }
    : {}),
  checkpointer: new MemorySaver(),
  policy: {
    maxModelInvocations:
      (withOutline ? 10 : withArgumentWork ? 7 : 6) + (rejectOutline ? 1 : 0),
    maxRejectedProposals: 2,
    deadlineMs: 60000,
  },
  materialRecovery: {
    modelInvocations: withArgumentWork && !checkpointArguments ? 1 : 0,
    ...(checkpointArguments
      ? {
          argumentPlanning: {
            model,
            observe: (event) => {
              argumentProgress.push(event);
              if (!argumentNotificationFailed) {
                argumentNotificationFailed = true;
                throw argumentNotificationFailure;
              }
            },
          },
        }
      : {}),
    replan: async ({ source, request, model: leasedModel, signal }) => {
      callbacks++;
      if (withArgumentWork && !checkpointArguments) {
        const pendingReplacement = fixture.replacement;
        const work = describeWorkflowConnectionMaterialRepairWork({
          source,
          request,
          replacement: pendingReplacement,
        });
        assert.equal(work.apiArgumentTasks.length, 1);
        const apiArguments = [...pendingReplacement.apiArguments];
        for (const task of work.apiArgumentTasks) {
          const generated = await generateApiArguments({
            ...task.input,
            model: leasedModel,
            signal,
            trackRequestedInputs: true,
          });
          assert.deepEqual(
            generated.values,
            {},
            'The scenario has no explicit independent price value',
          );
          const index = apiArguments.findIndex(
            (args) => args.callId === generated.callId,
          );
          assert.notEqual(index, -1);
          apiArguments[index] = {
            callId: generated.callId,
            ...selectWorkflowConnectionArgumentValues(generated),
          };
        }
        const replacement = { ...pendingReplacement, apiArguments };
        const inspection = inspectWorkflowConnectionMaterialRepairInputs({
          source,
          request: work.request,
          replacement,
        });
        return {
          kind: 'dependent-api-arguments',
          pendingReplacement,
          work,
          replacement: {
            ...replacement,
            deferredApiInputIds: inspection.slots.map((slot) => slot.id),
          },
        };
      }
      if (withDeferredApiInput) {
        const inspection = inspectWorkflowConnectionMaterialRepairInputs({
          source,
          request,
          replacement: fixture.replacement,
        });
        assert.deepEqual(
          inspection.slots.map((slot) => [slot.callId, slot.targetPointer]),
          [['price', '/query/id']],
        );
        // Explicit policy of this test host: missing request inputs are supplied at execution time.
        return {
          ...fixture.replacement,
          deferredApiInputIds: inspection.slots.map((slot) => slot.id),
        };
      }
      return fixture.replacement;
    },
    observe: (event) => progress.push(event),
  },
});
const config = { configurable: { thread_id: runId } };
if (checkpointArguments) {
  await assert.rejects(
    graph.invoke({}, config),
    (error) => error === argumentNotificationFailure,
  );
  const saved = await graph.getState(config);
  assert.deepEqual(saved.next, ['publishMaterialArguments']);
  assert.equal(
    saved.values.pendingMaterialArgumentWork.completedArguments.length,
    1,
  );
  assert.equal(saved.values.materialRepairs.length, 0);
  assert.equal(callbacks, 1);
}
const state = await graph.invoke(checkpointArguments ? null : {}, config);
if (checkpointArguments) {
  assert.equal(argumentProgress.length, 2);
  assert.deepEqual(argumentProgress[0], argumentProgress[1]);
  assert.equal(state.pendingMaterialArgumentWork, undefined);
}
assert.equal(state.status, 'complete');
assert.equal(callbacks, 1);
assert.equal(
  model.requests.length,
  (withGoalReview ? 6 : 4) +
    (withArgumentWork ? 1 : 0) +
    (withOutline ? 3 : 0) +
    (rejectOutline ? 1 : 0),
);
assert.equal(state.rejectedGoalProposals.length, withGoalReview ? 0 : 1);
if (withGoalReview)
  assert.deepEqual(
    state.goalReviews.map((candidate) => candidate.review.accepted),
    [false, true],
  );
assert.equal(state.materialRepairs.length, 1);
if (withOutline) {
  assert.equal(state.outlineHistory.length, 1);
  assert.equal(state.session.revision, 3);
  assert.equal(selectedBundle, 3);
  assert.equal(state.rejectedOutlineProposals.length, rejectOutline ? 1 : 0);
  if (rejectOutline) {
    const correction = model.requests.find((request) =>
      request.payload.rejectedProposals?.some(
        (rejection) => rejection.requestFingerprint,
      ),
    );
    assert.ok(correction);
    assert.deepEqual(
      correction.payload.rejectedProposals,
      state.rejectedOutlineProposals,
    );
  }
}
if (withArgumentWork)
  assert.deepEqual(state.materialRepairs[0].workSource.request, {
    kind: 'replan-materials',
    sourceFingerprint: originalFingerprint,
    request: fixture.request,
  });
const source = replayWorkflowConnectionMaterialRepair({
  source: fixture.broken,
  receipt: state.materialRepairs[0],
});
if (withDeferredApiInput) {
  assert.equal(source.deferredApiInputIds.length, 1);
  const actual = source.materials.find(
    (material) => material.arguments.callId === 'price',
  );
  assert.deepEqual(actual.arguments.values, {});
  assert.deepEqual(
    actual.arguments.bindings,
    fixture.replacement.apiArguments[0].bindings,
  );
  for (const material of source.materials)
    if (material.arguments.callId !== 'price')
      assert.deepEqual(
        material,
        fixture.source.materials.find(
          (original) => original.arguments.callId === material.arguments.callId,
        ),
      );
} else assert.deepEqual(source.materials, fixture.source.materials);
assert.equal(
  describeWorkflowConnectionGoals(fixture.broken).sourceFingerprint,
  originalFingerprint,
);
await writeFile(
  new URL('private-planning-state.json', directory),
  JSON.stringify(state, null, 2),
);
const runtime = await createFiveApiDagRuntime(runId),
  executions = [];
try {
  const ready = source.materials.map(({ status, ...material }) => {
    assert.equal(status, 'ready');
    return material;
  });
  const names = Object.fromEntries(
    ready.map((material) => [
      material.arguments.callId,
      `Request ${material.arguments.callId}`,
    ]),
  );
  const templateContext = {
    operations: ready.map((material) => material.operation),
    capabilities: source.capabilities,
    messages: [{ id: 'request', text: source.scenario }],
  };
  const draft = withDeferredApiInput
    ? createWorkflowDraft({
        context: templateContext,
        content: {
          id: runId,
          requirements: source.requirements.map((fact) => ({
            id: fact.id,
            text: fact.text,
            state: 'confirmed',
            scope: { kind: 'workflow' },
            sourceMessageIds: ['request'],
          })),
          apiCalls: ready.map((material) => ({
            id: material.arguments.callId,
            operation: material.operation.key,
            values: material.arguments.values,
            bindings: material.arguments.bindings,
            ...(material.arguments.requestMediaType === undefined
              ? {}
              : { requestMediaType: material.arguments.requestMediaType }),
            ...(material.arguments.requestedInputs === undefined
              ? {}
              : { requestedInputs: material.arguments.requestedInputs }),
          })),
          nativeNodes: state.plan.nativeNodes,
          edges: state.plan.edges,
        },
      })
    : undefined;
  const templateInput =
    draft === undefined
      ? undefined
      : {
          draft,
          context: templateContext,
          name: 'Initial material-origin recovery with explicit input slots',
          deployments: [
            ...new Set(
              ready.map((material) => material.operation.key.documentId),
            ),
          ].map((documentId) => ({
            documentId,
            baseUrl: runtime.baseUrl,
            credentialBindings: {},
          })),
        };
  const compiled =
    templateInput === undefined
      ? compilePlannedN8nWorkflow({
          id: runId,
          name: 'Initial material-origin recovery',
          plan: state.plan,
          materials: ready,
          capabilities: source.capabilities,
          apiNodes: ready.map((material, index) =>
            createHttpRequestNode({
              ...material,
              baseUrl: runtime.baseUrl,
              credentialBindings: {},
              apiNodeNames: names,
              position: [300, index * 200],
            }),
          ),
        })
      : compileN8nWorkflowTemplate(templateInput);
  if (withDeferredApiInput) {
    assert.equal(compiled.requestInputsReady, false);
    assert.deepEqual(
      compiled.inputSlots.map((slot) => slot.id),
      source.deferredApiInputIds,
    );
  }
  await writeFile(
    new URL('recovered.workflow.json', directory),
    JSON.stringify(compiled.workflow, null, 2),
  );
  for (let index = 0; index < 2; index++) {
    const id = randomUUID(),
      detailId = randomUUID(),
      independentId = randomUUID();
    assert.notEqual(id, detailId);
    const workflow =
      templateInput === undefined
        ? compiled.workflow
        : compileN8nWorkflowTemplate({
            ...templateInput,
            inputValues: { [source.deferredApiInputIds[0]]: independentId },
          }).workflow;
    if (withDeferredApiInput)
      await writeFile(
        new URL(`runtime-input-${index}.workflow.json`, directory),
        JSON.stringify(workflow, null, 2),
      );
    const offset = runtime.requests.length;
    const result = await runtime.execute(
      workflow,
      { id, labels: ['=literal-data', '雪', 'plain'], filter: { R: 0 } },
      { detailId, priceRequestId: withDeferredApiInput ? independentId : id },
    );
    const requests = runtime.requests.slice(offset);
    assert.equal(
      requests
        .find((request) => request.path === '/price')
        .query.find(([key]) => key === 'id')[1],
      withDeferredApiInput ? independentId : id,
    );
    executions.push({
      status: result.execution.status,
      sourceId: id,
      detailId,
      ...(withDeferredApiInput ? { independentInputId: independentId } : {}),
      requests,
    });
  }
  const report = {
    status: 'passed',
    withGoalReview,
    withDeferredApiInput,
    withArgumentWork,
    checkpointArguments,
    argumentProgress,
    withOutline,
    rejectOutline,
    scope:
      'Fixed synthetic selected material/decisions: rejected initial goal/material pair, source-stage replacement, unchanged goals, SDK compilation and isolated n8n. Not actual model, original-five full generation or Qoopilot UI.',
    actualModelCalls: 0,
    plannedModelInvocations: model.requests.length,
    reservedModelInvocations: state.modelInvocations,
    callbacks,
    businessApiCalls: 0,
    progress,
    firstRejection: state.rejectedGoalProposals[0],
    ...(withGoalReview
      ? { goalReviews: state.goalReviews.map((candidate) => candidate.review) }
      : {}),
    executions,
    localRequests: runtime.requests.length,
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      withGoalReview,
      withDeferredApiInput,
      withArgumentWork,
      checkpointArguments,
      withOutline,
      rejectOutline,
      directory: directory.pathname,
      reservedModelInvocations: state.modelInvocations,
      executions: executions.length,
      localRequests: report.localRequests,
    }),
  );
} finally {
  await runtime.close();
}
