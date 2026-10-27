import {
  incrementalConnectionFixture,
  incrementalConnectionPatch,
  incrementalConnectionModelPatch,
} from './incremental-connection-fixture.mjs';

export function connectionOutlineProposal(description) {
  return {
    purpose:
      'Read the source, plan independent branches and then join their results for summary.',
    bundles: [
      {
        purpose: 'Source boundary',
        nodeIds: ['source'],
        goalIds: [],
        factIds: ['intent'],
        reason: 'The original source supplies branch values.',
      },
      {
        purpose: 'Independent branches and join',
        nodeIds: ['detail', 'price', 'stock', 'join'],
        goalIds: description.goals
          .filter((goal) => goal.decision.kind !== 'precedence')
          .map((goal) => goal.id),
        factIds: ['intent'],
        reason: 'Keep the independent responses and their real join together.',
      },
      {
        purpose: 'Summary boundary',
        nodeIds: ['join', 'summary'],
        goalIds: description.goals
          .filter((goal) => goal.decision.kind === 'precedence')
          .map((goal) => goal.id),
        factIds: ['intent'],
        reason: 'Summary consumes the actual joined responses.',
      },
    ],
  };
}
export function connectionOutlineFixture() {
  const fixture = incrementalConnectionFixture();
  const patches = [
    incrementalConnectionPatch({
      addEdges: fixture.plan.edges.filter((edge) => edge.from === 'source'),
      addRootNodeIds: ['source'],
    }),
    incrementalConnectionPatch({
      addEdges: fixture.plan.edges.filter((edge) =>
        ['detail', 'price', 'stock'].includes(edge.from),
      ),
    }),
    incrementalConnectionPatch({
      addEdges: fixture.plan.edges.filter((edge) => edge.from === 'join'),
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  ];
  return {
    ...fixture,
    patches,
    modelPatches: patches.map((patch) => ({
      decision: incrementalConnectionModelPatch(fixture.source, patch),
    })),
  };
}
