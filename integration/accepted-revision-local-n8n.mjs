import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { MemorySaver } from '@langchain/langgraph';
import {
  createIncrementalWorkflowConnectionGraph,
  resolveIncrementalConnectionSource,
} from '@openapi-flow/example-langgraph-workflow';
import {
  compilePlannedN8nWorkflow,
  createHttpRequestNode,
} from '@openapi-flow/n8n';
import { acceptedConnectionRecoveryFixture } from '../test/fixtures/accepted-connection-recovery-fixture.mjs';
import { recoveryQueueModel } from '../test/fixtures/initial-connection-recovery-fixture.mjs';
import { connectionGoalReviewOutput } from '../test/fixtures/connection-goal-review-fixture.mjs';
import { createFiveApiDagRuntime } from './fixtures/five-api-dag-runtime.mjs';

// Fixed synthetic material and model decisions. This validates scheduling and engine behavior, not model quality.
const fixture = acceptedConnectionRecoveryFixture();
const runId = randomUUID();
const withGoalReview = process.argv.includes('--with-goal-review');
const incomplete = globalThis.structuredClone(fixture.correctedRevision);
incomplete.decision.goals = fixture.acceptedGoals;
const model = recoveryQueueModel([
  { goals: fixture.acceptedGoals },
  ...(withGoalReview
    ? [({ payload }) => connectionGoalReviewOutput(payload)]
    : []),
  fixture.firstPatch,
  fixture.completion,
  { decision: fixture.request },
  ...(withGoalReview
    ? [
        incomplete,
        ({ payload }) => connectionGoalReviewOutput(payload, 'missing'),
      ]
    : []),
  fixture.correctedRevision,
  ...(withGoalReview
    ? [({ payload }) => connectionGoalReviewOutput(payload)]
    : []),
]);
let callbacks = 0;
const options = {
  source: () => fixture.broken,
  model,
  checkpointer: new MemorySaver(),
  policy: {
    maxModelInvocations: 12,
    maxRejectedProposals: 4,
    deadlineMs: 60000,
  },
  revisionPlanning: { model },
  ...(withGoalReview ? { initialGoalReview: { model } } : {}),
  materialRecovery: {
    modelInvocations: 0,
    replan: async () => {
      callbacks++;
      return fixture.replacement;
    },
  },
};
const state = await createIncrementalWorkflowConnectionGraph(options).invoke(
  {},
  { configurable: { thread_id: runId } },
);
assert.equal(state.status, 'complete');
assert.equal(callbacks, 1);
assert.equal(state.modelInvocations, withGoalReview ? 9 : 5);
assert.equal(model.requests.length, state.modelInvocations);
assert.equal(state.sourceEvents.length, 1);
assert.deepEqual(state.sourceEvents[0].beforeSession.edges, fixture.firstEdges);
assert.deepEqual(state.sourceEvents[0].revision.impact.changedNodeIds, [
  'price',
]);
if (withGoalReview) {
  assert.equal(state.rejectedRevisionReviews.length, 1);
  assert.equal(state.sourceEvents[0].review.accepted, true);
}
const source = resolveIncrementalConnectionSource(options, state);
const directory = new URL(
  `../.local-artifacts/accepted-revision/${runId}/`,
  import.meta.url,
);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL('private-planning-state.json', directory),
  JSON.stringify(state, null, 2),
);
const runtime = await createFiveApiDagRuntime(runId);
const executions = [];
try {
  const materials = source.materials.map(({ status, ...material }) => {
    assert.equal(status, 'ready');
    return material;
  });
  const names = Object.fromEntries(
    materials.map((material) => [
      material.arguments.callId,
      `Request ${material.arguments.callId}`,
    ]),
  );
  const compiled = compilePlannedN8nWorkflow({
    id: runId,
    name: 'Accepted-region material recovery',
    plan: state.plan,
    materials,
    capabilities: source.capabilities,
    apiNodes: materials.map((material, index) =>
      createHttpRequestNode({
        ...material,
        baseUrl: runtime.baseUrl,
        credentialBindings: {},
        apiNodeNames: names,
        position: [300, index * 200],
      }),
    ),
  });
  await writeFile(
    new URL('recovered.workflow.json', directory),
    JSON.stringify(compiled.workflow, null, 2),
  );
  for (const index of [1, 2]) {
    const actualSource = {
      id: `source-${index}`,
      labels: [`label|${index}`, ''],
      filter: { R: 0 },
    };
    const detailId = `detail-${index}`;
    const result = await runtime.execute(compiled.workflow, actualSource, {
      detailId,
      priceRequestId: actualSource.id,
    });
    executions.push({
      status: result.execution.status,
      sourceId: actualSource.id,
      detailId,
    });
  }
  assert.equal(runtime.requests.length, 10);
  const report = {
    status: 'passed',
    scope:
      'Fixed synthetic five-API material, accepted-region recovery, optional negative revised-goal review and isolated SDK/n8n. Not original-five generation or actual model/UI quality.',
    withGoalReview,
    actualModelCalls: 0,
    plannedModelInvocations: model.requests.length,
    reservedModelInvocations: state.modelInvocations,
    callbacks,
    acceptedSourceEvents: state.sourceEvents.length,
    affectedNodeIds: state.sourceEvents[0].revision.impact.affectedNodeIds,
    engine: runtime.image,
    executions,
    localRequests: runtime.requests.length,
    businessApiCalls: 0,
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      directory: directory.pathname,
      withGoalReview,
      reservedModelInvocations: state.modelInvocations,
      executions: executions.length,
      localRequests: runtime.requests.length,
    }),
  );
} finally {
  await runtime.close();
}
