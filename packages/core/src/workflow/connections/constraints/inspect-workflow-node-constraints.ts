import type { WorkflowConnectionGoalProposal } from '../../../types/workflow-connection-session.js';
import type { WorkflowPlanNodeContract } from '../../../types/workflow-plan.js';
import type {
  InspectWorkflowNodeConstraintsInput,
  WorkflowPlanningDependency,
  WorkflowPlanningConflict,
  WorkflowPlanningConstraintInspection,
} from '../../../types/workflow-planning-constraints.js';
import { workflowPlanningConstraintInspectionSchema } from '../../../schemas/workflow-planning-constraint-schema.js';
import { workflowConnectionEdgeId } from '../incremental/connection-graph-identity.js';
import {
  findWorkflowDependencyCycles,
  findWorkflowDependencyPath,
  collectWorkflowDependencyParents,
} from './find-workflow-dependency-path.js';
import { workflowGoalNodeIds } from './workflow-goal-node-ids.js';

function inspectGoalNodes(
  goal: WorkflowConnectionGoalProposal,
  nodes: Map<string, WorkflowPlanNodeContract>,
): void {
  const ids = workflowGoalNodeIds(goal);
  if (new Set(ids).size !== ids.length || ids.some((id) => !nodes.has(id)))
    throw new Error(
      'Connection goal references unknown, repeated or self nodes',
    );
  if (
    goal.kind === 'route' &&
    !nodes.get(goal.from)!.outputs.includes(goal.output)
  )
    throw new Error('Connection goal references an unknown output port');
  if (goal.kind === 'join' && !nodes.get(goal.nodeId)!.waitsForAllInputs)
    throw new Error(
      'Connection join goal requires a registered all-input join',
    );
}

function participatingGoalIndexes(
  dependencies: WorkflowPlanningDependency[],
): number[] {
  return [
    ...new Set(
      dependencies.flatMap((edge) =>
        edge.origin.kind === 'goal' ? [edge.origin.goalIndex] : [],
      ),
    ),
  ];
}

/** Derived only from selected references and explicit goals, never matching field names. */
export function inspectWorkflowNodeConstraints({
  contracts,
  goals,
  protectedEdges,
}: InspectWorkflowNodeConstraintsInput): WorkflowPlanningConstraintInspection {
  const nodes = new Map(contracts.map((node) => [node.id, node]));
  if (nodes.size !== contracts.length)
    throw new Error('Planning constraints require distinct node contracts');
  const dependencies: WorkflowPlanningDependency[] = [];
  for (const consumer of contracts) {
    for (const reference of consumer.references)
      dependencies.push({
        from: reference.nodeId,
        to: consumer.id,
        scope: { kind: 'node' },
        origin: {
          kind: 'value-reference',
          source: reference.source,
          pointer: reference.pointer,
        },
      });
    for (const from of consumer.dependencyNodeIds)
      dependencies.push({
        from,
        to: consumer.id,
        scope: { kind: 'node' },
        origin: { kind: 'native-dependency' },
      });
    for (const [port, references] of Object.entries(
      consumer.inputReferences === undefined ? {} : consumer.inputReferences,
    )) {
      if (!consumer.inputs.includes(port))
        throw new Error(
          `node ${consumer.id}: input references name unknown port ${port}`,
        );
      for (const reference of references)
        dependencies.push({
          from: reference.nodeId,
          to: consumer.id,
          scope: { kind: 'input-port', port },
          origin: {
            kind: 'value-reference',
            source: reference.source,
            pointer: reference.pointer,
          },
        });
    }
  }
  for (const edge of protectedEdges)
    dependencies.push({
      from: edge.from,
      to: edge.to,
      scope: { kind: 'node' },
      origin: {
        kind: 'protected-connection',
        edgeId: workflowConnectionEdgeId(edge),
      },
    });
  goals.forEach((goal, goalIndex) => {
    inspectGoalNodes(goal, nodes);
    if (goal.kind === 'semantic' || goal.kind === 'independent') return;
    const origin = {
      kind: 'goal' as const,
      goalIndex,
      factIds: [...goal.factIds],
      goalKind: goal.kind,
    };
    const to =
      goal.kind === 'join'
        ? goal.nodeId
        : goal.kind === 'precedence'
          ? goal.after
          : goal.to;
    const producers =
      goal.kind === 'join'
        ? goal.producerIds
        : goal.kind === 'precedence'
          ? [goal.before]
          : [goal.from];
    for (const from of producers)
      dependencies.push({ from, to, scope: { kind: 'node' }, origin });
  });
  const adjacency = new Map<string, WorkflowPlanningDependency[]>(
    contracts.map((node) => [node.id, []]),
  );
  for (const edge of dependencies) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to))
      throw new Error(
        `Planning constraint references an unknown node: ${edge.from} -> ${edge.to}`,
      );
    // Port-specific references remain scoped. Final route analysis owns their availability proof.
    if (edge.scope.kind === 'node') adjacency.get(edge.from)!.push(edge);
  }
  const conflicts: WorkflowPlanningConflict[] = findWorkflowDependencyCycles(
    adjacency,
  ).map((cycle) => ({
    code: 'DEPENDENCY_CYCLE',
    message:
      'Selected data dependencies, protected connections and proposed goals require a cyclic execution order.',
    nodeIds: [cycle[0].from, ...cycle.map((edge) => edge.to)],
    goalIndexes: participatingGoalIndexes(cycle),
    dependencies: cycle,
  }));
  goals.forEach((goal, goalIndex) => {
    if (goal.kind !== 'independent') return;
    const members = new Set(goal.nodeIds);
    for (const from of goal.nodeIds) {
      const parents = collectWorkflowDependencyParents(adjacency, from);
      for (const to of parents.keys()) {
        if (!members.has(to)) continue;
        const path = findWorkflowDependencyPath({ parents, from, to });
        conflicts.push({
          code: 'INDEPENDENCE_CONFLICT',
          message:
            'An independence goal contains nodes with a required execution dependency.',
          nodeIds: [from, ...path.map((edge) => edge.to)],
          goalIndexes: [
            ...new Set([goalIndex, ...participatingGoalIndexes(path)]),
          ],
          dependencies: path,
        });
      }
    }
  });
  return workflowPlanningConstraintInspectionSchema.parse({
    checkedScope: 'necessary-node-order',
    dependencies,
    conflicts,
  });
}
