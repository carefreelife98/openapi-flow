import { initialConnectionRecoveryFixture } from './initial-connection-recovery-fixture.mjs';
import {
  incrementalConnectionPatch,
  incrementalConnectionModelPatch,
} from './incremental-connection-fixture.mjs';

export function acceptedConnectionRecoveryFixture() {
  const original = initialConnectionRecoveryFixture();
  const firstEdges = original.plan.edges.filter(
    (edge) => edge.from === 'source' && edge.to !== 'price',
  );
  return {
    ...original,
    acceptedGoals: original.goals.filter((goal) => goal.kind !== 'independent'),
    firstEdges,
    firstPatch: {
      decision: incrementalConnectionModelPatch(
        original.broken,
        incrementalConnectionPatch({
          addEdges: firstEdges,
          addRootNodeIds: ['source'],
        }),
      ),
    },
    completion: {
      decision: {
        kind: 'request-completion',
        assessments: [],
        reason: 'Attempt to finish the current partial graph.',
      },
    },
    correctedRevision: {
      decision: {
        kind: 'revise-connections',
        goals: original.goals,
        graphChange: incrementalConnectionModelPatch(
          original.source,
          incrementalConnectionPatch({
            addEdges: original.plan.edges.filter(
              (edge) => !firstEdges.includes(edge),
            ),
            addTerminals: [{ nodeId: 'summary', output: 'main' }],
          }),
        ),
      },
    },
  };
}
