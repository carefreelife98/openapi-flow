import assert from 'node:assert/strict';
import {
  createWorkflowConnectionSession,
  applyWorkflowConnectionStep,
  describeWorkflowConnectionStep,
} from '@openapi-flow/core';
import { planWorkflowConnectionRevision } from '@openapi-flow/langchain';
import {
  incrementalConnectionFixture,
  incrementalConnectionPatch,
  incrementalConnectionModelPatch,
} from './incremental-connection-fixture.mjs';

export function connectionRevisionRejectionFixture() {
  const {
    source: original,
    goals: originalGoals,
    plan,
  } = incrementalConnectionFixture();
  const scenario =
    'Get detail from source. Price requires detail. Stock requires source. Join the three results before summary.';
  const source = {
    ...original,
    scenario,
    requirements: [
      {
        id: 'intent',
        text: scenario,
        sources: [{ kind: 'message', messageId: 'request', quote: scenario }],
      },
    ],
  };
  const goals = originalGoals.filter((goal) => goal.kind !== 'independent');
  const initial = createWorkflowConnectionSession({ ...source, goals });
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
  const description = describeWorkflowConnectionStep(before);
  const materials = globalThis.structuredClone(source.materials);
  materials.find(
    (item) => item.arguments.callId === 'price',
  ).arguments.bindings[0].sourceNodeId = 'detail';
  const after = { ...source, materials };
  const graphChange = incrementalConnectionModelPatch(
    after,
    incrementalConnectionPatch({
      addEdges: [
        { from: 'detail', output: 'main', to: 'price', input: 'main' },
      ],
    }),
  );
  const rejectedOutput = {
    decision: {
      kind: 'revise-connections',
      goals: [
        ...goals,
        {
          kind: 'precedence',
          before: 'detail',
          after: 'price',
          factIds: ['intent'],
          reason: 'Price uses the original detail result.',
        },
      ],
      graphChange,
    },
  };
  const correctedOutput = globalThis.structuredClone(rejectedOutput);
  correctedOutput.decision.graphChange.removeEdgeIds = [
    description.edgeCatalog.find(
      ({ edge }) => edge.from === 'source' && edge.to === 'price',
    ).id,
  ];
  return {
    input: { before, after, expected: description.expected },
    rejectedOutput,
    correctedOutput,
  };
}

export function revisionFeedbackModel(output, observe = () => {}) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages, configuration) {
          const call = {
            schema,
            options,
            configuration,
            payload: JSON.parse(messages[1].content),
          };
          calls.push(call);
          await observe(call);
          if (output instanceof Error) throw output;
          return globalThis.structuredClone(output);
        },
      };
    },
  };
}

export async function captureRevisionFailure(input, model) {
  let failure;
  try {
    await planWorkflowConnectionRevision({ ...input, model });
  } catch (error) {
    failure = error;
  }
  assert.ok(
    failure,
    'A rejected proposal must not become a successful candidate',
  );
  return failure;
}
