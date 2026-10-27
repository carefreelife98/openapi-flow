import { isDeepStrictEqual } from 'node:util';
import type {
  AnalyzeWorkflowConnectionRevisionImpactInput,
  WorkflowConnectionRevisionImpact,
  WorkflowConnectionRevisionNode,
  WorkflowConnectionRevisionNodeMapInput,
} from '../../../types/workflow-connection-revision.js';
import { workflowGoalNodeIds } from '../constraints/workflow-goal-node-ids.js';
import { workflowConnectionEdgeId } from '../incremental/connection-graph-identity.js';
import { createComparableConnectionArgumentValues } from '../materials/create-comparable-connection-argument-values.js';
import type {
  WorkflowPlanNodeContract,
  WorkflowValueReference,
} from '../../../types/workflow-plan.js';

function compareReferences(
  a: WorkflowValueReference,
  b: WorkflowValueReference,
): number {
  return JSON.stringify([a.source, a.nodeId, a.pointer]).localeCompare(
    JSON.stringify([b.source, b.nodeId, b.pointer]),
  );
}
function comparableContract(
  node: WorkflowPlanNodeContract,
): WorkflowPlanNodeContract {
  return {
    ...node,
    references: [...node.references].sort(compareReferences),
    dependencyNodeIds: [...node.dependencyNodeIds].sort(),
    ...(node.inputReferences === undefined
      ? {}
      : {
          inputReferences: Object.fromEntries(
            Object.entries(node.inputReferences).map(([port, references]) => [
              port,
              [...references].sort(compareReferences),
            ]),
          ),
        }),
  };
}

function nodeMap({
  snapshot,
}: WorkflowConnectionRevisionNodeMapInput): Map<
  string,
  WorkflowConnectionRevisionNode
> {
  return new Map<string, WorkflowConnectionRevisionNode>([
    ...snapshot.materials.map(
      (node) =>
        [
          node.status === 'ready' ? node.arguments.callId : node.callId,
          node.status !== 'ready'
            ? node
            : {
                ...node,
                // Comparison only: declaration order and audit explanations are not executable changes.
                arguments: {
                  callId: node.arguments.callId,
                  ...createComparableConnectionArgumentValues(node.arguments),
                },
              },
        ] as const,
    ),
    ...snapshot.nativeNodes.map((node) => [node.id, node] as const),
  ]);
}

/** Causal invalidation over both old and new references/routes; never infers data mappings. */
export function analyzeWorkflowConnectionRevisionImpact(
  input: AnalyzeWorkflowConnectionRevisionImpactInput,
): WorkflowConnectionRevisionImpact {
  const oldNodes = nodeMap({ snapshot: input.before.source.input });
  const newNodes = nodeMap({ snapshot: input.after.source.input });
  const allIds = new Set(
    [
      ...input.before.source.context.nodes,
      ...input.after.source.context.nodes,
    ].map((node) => node.id),
  );
  const oldContracts = new Map(
    input.before.source.context.nodes.map((node) => [
      node.id,
      comparableContract(node),
    ]),
  );
  const newContracts = new Map(
    input.after.source.context.nodes.map((node) => [
      node.id,
      comparableContract(node),
    ]),
  );
  const oldOutputs = new Map(
    input.before.source.sources.nativeOutputs.map((output) => [
      output.nodeId,
      output,
    ]),
  );
  const newOutputs = new Map(
    input.after.source.sources.nativeOutputs.map((output) => [
      output.nodeId,
      output,
    ]),
  );
  const oldDefinitions = new Map(
    input.before.source.sources.capabilities.map((capability) => [
      capability.name,
      capability,
    ]),
  );
  const newDefinitions = new Map(
    input.after.source.sources.capabilities.map((capability) => [
      capability.name,
      capability,
    ]),
  );
  const nativeIds = new Map(
    [
      ...input.before.source.input.nativeNodes,
      ...input.after.source.input.nativeNodes,
    ].map((node) => [node.id, node.capability]),
  );
  const changedNodeIds = [...allIds].filter(
    (id) =>
      !isDeepStrictEqual(oldNodes.get(id), newNodes.get(id)) ||
      !isDeepStrictEqual(oldContracts.get(id), newContracts.get(id)) ||
      !isDeepStrictEqual(oldOutputs.get(id), newOutputs.get(id)) ||
      (nativeIds.has(id) &&
        !isDeepStrictEqual(
          oldDefinitions.get(nativeIds.get(id)!),
          newDefinitions.get(nativeIds.get(id)!),
        )),
  );
  const affected = new Set(changedNodeIds);
  const propagated = new Set(changedNodeIds);
  const oldGoals = new Map(
    input.previousSession.goals.map((goal) => [goal.id, goal]),
  );
  const newGoals = new Map(input.goals.map((goal) => [goal.id, goal]));
  const addedGoalIds = [...newGoals.keys()].filter((id) => !oldGoals.has(id));
  const removedGoalIds = [...oldGoals.keys()].filter((id) => !newGoals.has(id));
  const affectedFactIds = new Set<string>();
  for (const goal of [
    ...removedGoalIds.map((id) => oldGoals.get(id)!),
    ...addedGoalIds.map((id) => newGoals.get(id)!),
  ]) {
    goal.decision.factIds.forEach((id) => affectedFactIds.add(id));
    const ids =
      goal.decision.kind === 'semantic'
        ? [...allIds]
        : workflowGoalNodeIds(goal.decision);
    ids.forEach((id) => {
      affected.add(id);
      propagated.add(id);
    });
  }
  const oldEdges = new Set(
    input.previousSession.edges.map(workflowConnectionEdgeId),
  );
  const newEdges = new Set(input.graph.edges.map(workflowConnectionEdgeId));
  const edges = [...input.previousSession.edges, ...input.graph.edges];
  for (const edge of edges)
    if (
      oldEdges.has(workflowConnectionEdgeId(edge)) !==
      newEdges.has(workflowConnectionEdgeId(edge))
    ) {
      affected.add(edge.from);
      affected.add(edge.to);
      propagated.add(edge.to);
    }
  const oldRoots = new Set(input.previousSession.rootNodeIds);
  const newRoots = new Set(input.graph.rootNodeIds);
  for (const id of new Set([...oldRoots, ...newRoots]))
    if (oldRoots.has(id) !== newRoots.has(id)) {
      affected.add(id);
      propagated.add(id);
    }
  const oldTerminals = new Set(
    input.previousSession.terminals.map((terminal) =>
      JSON.stringify([terminal.nodeId, terminal.output]),
    ),
  );
  const newTerminals = new Set(
    input.graph.terminals.map((terminal) =>
      JSON.stringify([terminal.nodeId, terminal.output]),
    ),
  );
  for (const terminal of [
    ...input.previousSession.terminals,
    ...input.graph.terminals,
  ])
    if (
      oldTerminals.has(JSON.stringify([terminal.nodeId, terminal.output])) !==
      newTerminals.has(JSON.stringify([terminal.nodeId, terminal.output]))
    ) {
      affected.add(terminal.nodeId);
      propagated.add(terminal.nodeId);
    }
  const dependencies = new Map<string, Set<string>>(
    [...allIds].map((id) => [id, new Set<string>()]),
  );
  for (const node of [...oldContracts.values(), ...newContracts.values()]) {
    const consumers = dependencies.get(node.id)!;
    for (const reference of [
      ...node.references,
      ...Object.values(node.inputReferences ?? {}).flat(),
    ])
      consumers.add(reference.nodeId);
    node.dependencyNodeIds.forEach((id) => consumers.add(id));
  }
  for (const edge of edges) dependencies.get(edge.to)!.add(edge.from);
  let expanded: boolean;
  do {
    expanded = false;
    for (const [id, producers] of dependencies)
      if (
        !propagated.has(id) &&
        [...producers].some((producer) => propagated.has(producer))
      ) {
        affected.add(id);
        propagated.add(id);
        expanded = true;
      }
  } while (expanded);
  const invalidatedAssessmentGoalIds = input.previousSession.assessments
    .filter(
      (assessment) =>
        !newGoals.has(assessment.goalId) ||
        assessment.nodeIds.some((id) => affected.has(id)),
    )
    .map((assessment) => assessment.goalId);
  return {
    changedNodeIds,
    affectedNodeIds: [...affected],
    preservedNodeIds: [...newContracts.keys()].filter(
      (id) => !affected.has(id),
    ),
    addedGoalIds,
    removedGoalIds,
    retainedGoalIds: [...newGoals.keys()].filter((id) => oldGoals.has(id)),
    affectedFactIds: [...affectedFactIds],
    retainedEdgeIds: [...newEdges].filter((id) => oldEdges.has(id)),
    removedEdgeIds: [...oldEdges].filter((id) => !newEdges.has(id)),
    addedEdgeIds: [...newEdges].filter((id) => !oldEdges.has(id)),
    invalidatedAssessmentGoalIds,
  };
}
