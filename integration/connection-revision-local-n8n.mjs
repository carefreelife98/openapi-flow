import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import console from 'node:console';
import {
  createWorkflowConnectionSession,
  applyWorkflowConnectionStep,
  describeWorkflowConnectionStep,
  applyWorkflowConnectionRevision,
  validateWorkflowConnectionRevision,
  finalizeWorkflowConnectionSession,
} from '@openapi-flow/core';
import { planWorkflowConnectionRevision } from '@openapi-flow/langchain';
import {
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';
import {
  incrementalConnectionFixture,
  incrementalConnectionPatch,
  incrementalConnectionModelPatch,
} from '../test/fixtures/incremental-connection-fixture.mjs';
import { createFiveApiDagRuntime } from './fixtures/five-api-dag-runtime.mjs';

// Synthetic fixed-material repair/engine regression, not an independent natural-language quality evaluation.
const runId = randomUUID();
const directory = new URL(
  `../.local-artifacts/connection-revision/${runId}/`,
  import.meta.url,
);
await mkdir(directory, { recursive: true });
const { source, goals, plan } = incrementalConnectionFixture();
source.scenario =
  'Read detail, price and stock, use the detail identifier for the price lookup, then collect the original results.';
source.requirements[0].text = source.scenario;
source.requirements[0].sources[0].quote = source.scenario;
const initialGoals = goals.filter((goal) => goal.kind !== 'independent');
const initial = createWorkflowConnectionSession({
  ...source,
  goals: initialGoals,
});
const applied = applyWorkflowConnectionStep({
  ...source,
  session: initial,
  expected: describeWorkflowConnectionStep({ ...source, session: initial })
    .expected,
  proposal: incrementalConnectionPatch({
    addEdges: plan.edges,
    addRootNodeIds: ['source'],
    addTerminals: [{ nodeId: 'summary', output: 'main' }],
  }),
});
assert.equal(applied.status, 'accepted');
const before = { ...source, session: applied.session };
const expected = describeWorkflowConnectionStep(before).expected;
const materials = globalThis.structuredClone(source.materials);
materials.find(
  (material) => material.arguments.callId === 'price',
).arguments.bindings[0].sourceNodeId = 'detail';
const after = { ...source, materials };
let initialFailure;
assert.throws(
  () =>
    applyWorkflowConnectionRevision({
      before,
      after,
      expected,
      proposal: {
        goals: initialGoals,
        graphChange: incrementalConnectionPatch({}),
      },
    }),
  (error) => {
    initialFailure = error.diagnostic;
    return error.diagnostic.code === 'WORKFLOW_GRAPH_PLANNING_FAILED';
  },
);
const removed = describeWorkflowConnectionStep(before).edgeCatalog.find(
  (entry) => entry.edge.to === 'price' && entry.edge.from === 'source',
);
const output = {
  decision: {
    kind: 'revise-connections',
    goals: [
      ...initialGoals,
      {
        kind: 'precedence',
        before: 'detail',
        after: 'price',
        factIds: ['intent'],
        reason:
          'The selected price binding requires the original detail result.',
      },
    ],
    graphChange: incrementalConnectionModelPatch(
      after,
      incrementalConnectionPatch({
        removeEdgeIds: [removed.id],
        addEdges: [
          { from: 'detail', output: 'main', to: 'price', input: 'main' },
        ],
      }),
    ),
  },
};
let modelCalls = 0;
const result = await planWorkflowConnectionRevision({
  before,
  after,
  expected,
  model: {
    withStructuredOutput() {
      return {
        invoke: async () => {
          modelCalls++;
          return globalThis.structuredClone(output);
        },
      };
    },
  },
});
assert.equal(result.kind, 'revised-connections');
validateWorkflowConnectionRevision({
  before,
  after,
  expected,
  proposal: result.revision.proposal,
  revision: result.revision,
});
assert.equal(result.revision.inspection.ready, true);
const revisedPlan = finalizeWorkflowConnectionSession({
  ...after,
  session: result.revision.session,
});
const runtime = await createFiveApiDagRuntime(runId);
const executions = [];
try {
  const seeds = [
    { id: randomUUID(), detailId: randomUUID() },
    { id: randomUUID(), detailId: randomUUID() },
  ];
  for (const [label, materialSource, graphPlan] of [
    ['baseline-fixed', source, plan],
    ['revised-candidate', after, revisedPlan],
  ]) {
    const ready = materialSource.materials.map(({ status, ...material }) => {
      assert.equal(status, 'ready');
      return material;
    });
    const names = Object.fromEntries(
      ready.map((material) => [
        material.arguments.callId,
        `Request ${material.arguments.callId}`,
      ]),
    );
    const compiled = compilePlannedN8nWorkflow({
      id: `${label}-${runId}`,
      name: label,
      plan: graphPlan,
      materials: ready,
      capabilities: materialSource.capabilities,
      apiNodes: ready.map((material, index) =>
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
      new URL(`${label}.workflow.json`, directory),
      JSON.stringify(compiled.workflow, null, 2),
    );
    for (const { id, detailId } of seeds) {
      assert.notEqual(id, detailId);
      const offset = runtime.requests.length;
      const execution = await runtime.execute(
        compiled.workflow,
        {
          id,
          labels: ['=literal-data', '雪', 'plain'],
          filter: { R: 0 },
        },
        {
          detailId,
          priceRequestId: label === 'baseline-fixed' ? id : detailId,
        },
      );
      const requests = runtime.requests.slice(offset);
      if (label === 'revised-candidate')
        assert.ok(
          requests.findIndex((request) => request.path.startsWith('/detail/')) <
            requests.findIndex((request) => request.path === '/price'),
        );
      assert.equal(
        requests
          .find((request) => request.path === '/price')
          .query.find(([name]) => name === 'id')[1],
        label === 'baseline-fixed' ? id : detailId,
      );
      executions.push({
        label,
        sourceId: id,
        detailId,
        status: execution.execution.status,
        requests,
      });
      console.log(`${label}: passed (${requests.length} local requests)`);
    }
  }
  for (const { id } of seeds)
    assert.deepEqual(
      executions
        .find((run) => run.sourceId === id && run.label === 'baseline-fixed')
        .requests.find((request) => request.path === '/summary').body,
      executions
        .find((run) => run.sourceId === id && run.label === 'revised-candidate')
        .requests.find((request) => request.path === '/summary').body,
    );
  const report = {
    status: 'passed',
    runId,
    image: runtime.image,
    modelCalls,
    actualModelCalls: 0,
    businessApiCalls: 0,
    initialFailure,
    revision: result.revision,
    executions,
    localRequests: runtime.requests.length,
    scope:
      'Fixed synthetic OAS/material and model proposals. Baseline and revised SDK workflows execute twice in isolated n8n. Explicit distinct source/detail response IDs prove the price input uses its selected producer without substitution. Original summary values/types and detail-before-price control flow are checked. This is not a full-model quality evaluation or Qoopilot UI integration.',
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(`Report: ${directory.pathname}`);
} finally {
  await runtime.close();
}
