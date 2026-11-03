import {
  describeWorkflowConnectionGoals,
  workflowConnectionEdgeId,
} from '@openapi-flow/core';
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

export function incrementalConnectionModelRegion(
  source,
  patch,
  current = { edges: source.edges ?? [], rootNodeIds: [], terminals: [] },
) {
  const { context } = describeWorkflowConnectionGoals(source);
  // Fixture callers supply their current accepted session for edits of existing nodes.
  const removed = new Set(patch.removeEdgeIds);
  const ownedEdges = current.edges.filter((edge) =>
    removed.has(workflowConnectionEdgeId(edge)),
  );
  const targets = new Set([
    ...patch.addEdges.map((edge) => edge.to),
    ...ownedEdges.map((edge) => edge.to),
    ...patch.addRootNodeIds,
    ...patch.removeRootNodeIds,
    ...patch.addTerminals.map((t) => t.nodeId),
    ...patch.removeTerminals.map((t) => t.nodeId),
  ]);
  if (targets.size === 0) targets.add(context.nodes[0].id);
  const after = [
    ...current.edges.filter(
      (edge) => !removed.has(workflowConnectionEdgeId(edge)),
    ),
    ...patch.addEdges,
  ];
  const select = (nodeId, port) => {
    const node = context.nodes.find((node) => node.id === nodeId);
    if (!node) throw new Error('Unknown fixture source ' + nodeId);
    return { nodeId, ...(node.outputs.length === 1 ? {} : { port }) };
  };
  return {
    kind: 'set-region',
    nodes: [...targets].map((nodeId) => {
      const node = context.nodes.find((node) => node.id === nodeId);
      if (!node) throw new Error('Unknown fixture target ' + nodeId);
      const terminals = [
        ...current.terminals.filter(
          (t) =>
            t.nodeId === nodeId &&
            !patch.removeTerminals.some(
              (r) => r.nodeId === t.nodeId && r.output === t.output,
            ),
        ),
        ...patch.addTerminals.filter((t) => t.nodeId === nodeId),
      ].map((t) => t.output);
      return {
        nodeId,
        incoming: after
          .filter((edge) => edge.to === nodeId)
          .map((edge) => ({
            source: select(edge.from, edge.output),
            ...(node.inputs.length === 1 ? {} : { input: edge.input }),
          })),
        root:
          patch.addRootNodeIds.includes(nodeId) ||
          (current.rootNodeIds.includes(nodeId) &&
            !patch.removeRootNodeIds.includes(nodeId)),
        ...(node.outputs.length === 1
          ? { finish: terminals.includes(node.outputs[0]) }
          : { finishOutputs: terminals }),
      };
    }),
    factIds: patch.factIds,
    reason: patch.reason,
  };
}
