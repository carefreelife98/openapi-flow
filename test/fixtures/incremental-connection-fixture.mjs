import { describeWorkflowConnectionGoals } from '@openapi-flow/core';
import { connectionPlanningFixture } from './connection-planning-record-fixture.mjs';

export function incrementalConnectionFixture() {
  const original = connectionPlanningFixture();
  const source = {
    ...original.input,
    edges: [],
    requirements: [
      {
        id: 'intent',
        text: original.input.scenario,
        sources: [
          {
            kind: 'message',
            messageId: 'request',
            quote: original.input.scenario,
          },
        ],
      },
    ],
  };
  const basis = { factIds: ['intent'], reason: 'Keep the agreed scenario.' };
  const goals = [
    { kind: 'precedence', before: 'source', after: 'summary', ...basis },
    { kind: 'independent', nodeIds: ['detail', 'price', 'stock'], ...basis },
    {
      kind: 'join',
      nodeId: 'join',
      producerIds: ['detail', 'price', 'stock'],
      ...basis,
    },
  ];
  return { source, goals, plan: original.plan };
}

export function incrementalConnectionPatch(changes) {
  return {
    kind: 'patch',
    addEdges: [],
    removeEdgeIds: [],
    addRootNodeIds: [],
    removeRootNodeIds: [],
    addTerminals: [],
    removeTerminals: [],
    factIds: ['intent'],
    reason: 'Apply one complete connection bundle.',
    ...changes,
  };
}

export function incrementalConnectionModelPatch(source, patch) {
  const { context } = describeWorkflowConnectionGoals(source);
  const select = (nodeId, port, direction) => {
    const node = context.nodes.find((node) => node.id === nodeId);
    if (!node) throw new Error(`Fixture has no node ${nodeId}`);
    return node[direction].length === 1 ? { nodeId } : { nodeId, port };
  };
  return {
    ...patch,
    addEdges: patch.addEdges.map((edge) => ({
      source: select(edge.from, edge.output, 'outputs'),
      target: select(edge.to, edge.input, 'inputs'),
    })),
    addTerminals: patch.addTerminals.map((item) =>
      select(item.nodeId, item.output, 'outputs'),
    ),
    removeTerminals: patch.removeTerminals.map((item) =>
      select(item.nodeId, item.output, 'outputs'),
    ),
  };
}
