import { isDeepStrictEqual } from 'node:util';
import type { WorkflowConnectionSessionInput } from '../../../types/workflow-connection-session.js';
import type {
  WorkflowConnectionDelivery,
  WorkflowConnectionDeliveryComponent,
} from '../../../types/workflow-connection-delivery.js';
import { validateWorkflowConnectionSession } from './validate-workflow-connection-session.js';
import { inspectWorkflowConnectionCompletion } from './inspect-workflow-connection-completion.js';
import { workflowGoalNodeIds } from '../constraints/workflow-goal-node-ids.js';
import { createWorkflowConnectionPlan } from '../create-workflow-connection-plan.js';

/** Partition only accepted receipts. Never invent wiring, erase a check, or infer independence from selection order. */
export function inspectWorkflowConnectionDelivery(
  input: WorkflowConnectionSessionInput,
): WorkflowConnectionDelivery {
  const { source } = validateWorkflowConnectionSession(input);
  const inspection = inspectWorkflowConnectionCompletion(input);
  const nodes = source.context.nodes;
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  const connect = (left: string, right: string) => {
    if (!adjacency.has(left) || !adjacency.has(right))
      throw new Error(
        `Delivery dependency names missing node ${left} -> ${right}`,
      );
    adjacency.get(left)!.add(right);
    adjacency.get(right)!.add(left);
  };
  for (const edge of input.session.edges) connect(edge.from, edge.to);
  for (const node of nodes) {
    for (const producer of [
      ...node.references.map((reference) => reference.nodeId),
      ...node.dependencyNodeIds,
      ...Object.values(node.inputReferences ?? {}).flatMap((references) =>
        references.map((reference) => reference.nodeId),
      ),
      ...(node.rejoinsExclusiveOutputs === undefined
        ? []
        : [node.rejoinsExclusiveOutputs]),
    ])
      connect(producer, node.id);
  }
  const anchors = new Map(
    input.session.goals.map((goal) => {
      const assessment = input.session.assessments.find(
        (item) => item.goalId === goal.id,
      );
      const ids =
        goal.decision.kind === 'semantic'
          ? assessment?.status === 'satisfied'
            ? assessment.nodeIds
            : nodes.map((node) => node.id)
          : workflowGoalNodeIds(goal.decision);
      // Independence and global inventory are assertions, never execution dependencies.
      if (
        goal.decision.kind !== 'independent' &&
        goal.decision.kind !== 'operation-set'
      )
        for (const id of ids.slice(1)) connect(ids[0], id);
      return [goal.id, ids] as const;
    }),
  );
  const blockedGoals = new Set([
    ...inspection.unmetGoalIds,
    ...inspection.unassessedGoalIds,
    ...inspection.insufficientEvidenceGoalIds,
  ]);
  const unseen = new Set(adjacency.keys());
  const components: WorkflowConnectionDeliveryComponent[] = [];
  while (unseen.size) {
    const pending = [unseen.values().next().value!];
    const ids = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (ids.has(id)) continue;
      ids.add(id);
      unseen.delete(id);
      pending.push(...adjacency.get(id)!);
    }
    const goals = input.session.goals.filter(
      (goal) =>
        goal.decision.kind === 'operation-set' ||
        anchors.get(goal.id)!.some((id) => ids.has(id)),
    );
    const gaps = source.input.gaps.filter(
      (gap) =>
        !adjacency.has(gap.id) ||
        ids.has(gap.id) ||
        (gap.callId !== undefined && ids.has(gap.callId)),
    );
    const component: WorkflowConnectionDeliveryComponent = {
      nodeIds: [...ids],
      goalIds: goals.map((goal) => goal.id),
      rootNodeIds: input.session.rootNodeIds.filter((id) => ids.has(id)),
      edges: input.session.edges.filter(
        (edge) => ids.has(edge.from) && ids.has(edge.to),
      ),
      nativeNodes: source.input.nativeNodes.filter((node) => ids.has(node.id)),
      apiCalls: source.input.materials.flatMap((material) =>
        material.status !== 'ready' || !ids.has(material.arguments.callId)
          ? []
          : [
              {
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
              },
            ],
      ),
      blockedCalls: source.input.materials.flatMap((material) =>
        material.status !== 'blocked' || !ids.has(material.callId)
          ? []
          : [{ callId: material.callId, gapIds: material.gapIds }],
      ),
      openBoundaries: inspection.openBoundaries.filter((boundary) =>
        ids.has(boundary.nodeId),
      ),
      pendingNodeIds: inspection.pendingNodeIds.filter((id) => ids.has(id)),
      blockedGoalIds: goals
        .filter((goal) => blockedGoals.has(goal.id))
        .map((goal) => goal.id),
      gapIds: gaps.map((gap) => gap.id),
      gaps,
      runtimeInputNodeIds: [
        ...source.input.nativeNodes
          .filter(
            (node) => ids.has(node.id) && node.runtimeParameters !== undefined,
          )
          .map((node) => node.id),
        ...(source.context.deferredApiInputs ?? [])
          .filter((slot) => ids.has(slot.callId))
          .map((slot) => slot.callId),
      ],
    };
    if (
      !inspection.violations.length &&
      component.rootNodeIds.length &&
      !component.openBoundaries.length &&
      !component.pendingNodeIds.length &&
      !component.blockedGoalIds.length &&
      !component.gapIds.length &&
      !component.runtimeInputNodeIds.length
    ) {
      const plan = createWorkflowConnectionPlan({
        ...input,
        materials: source.input.materials.filter((material) =>
          ids.has(
            material.status === 'ready'
              ? material.arguments.callId
              : material.callId,
          ),
        ),
        nativeNodes: component.nativeNodes,
        gaps: [],
        edges: component.edges,
        proposal: { edges: [], additionalGaps: [], blockedCalls: [] },
      });
      if (
        !isDeepStrictEqual(
          [...plan.starts].sort(),
          [...component.rootNodeIds].sort(),
        )
      )
        throw new Error('Delivery roots differ from the accepted receipt');
      component.plan = plan;
    }
    components.push(structuredClone(component));
  }
  const configured = components.filter(
    (component) => component.plan !== undefined,
  ).length;
  return {
    status:
      inspection.ready && configured === components.length
        ? 'complete'
        : configured
          ? 'partial'
          : 'draft',
    sessionId: input.session.id,
    sourceFingerprint: input.session.sourceFingerprint,
    revision: input.session.revision,
    components,
    unmetGoals: structuredClone(
      input.session.goals.filter((goal) => blockedGoals.has(goal.id)),
    ),
    unmetAssessments: structuredClone(
      input.session.assessments.filter((assessment) =>
        blockedGoals.has(assessment.goalId),
      ),
    ),
  };
}
