import type {
  WorkflowConnectionGoalProposal,
  WorkflowConnectionSession,
  WorkflowConnectionSessionSource,
} from '../../../types/workflow-connection-session.js';
import type { WorkflowPlanNodeContract } from '../../../types/workflow-plan.js';
import { workflowConnectionGoalProposalSchema } from '../../../schemas/workflow-connection-session-schema.js';
import {
  connectionValueFingerprint,
  workflowConnectionEdgeId,
} from './connection-graph-identity.js';
import { inspectWorkflowNodeConstraints } from '../constraints/inspect-workflow-node-constraints.js';
import { WorkflowPlanningConstraintError } from '../constraints/workflow-planning-constraint-error.js';
import { describeWorkflowConnectionEvidence } from '../requirements/describe-workflow-connection-evidence.js';
import {
  listWorkflowConnectionMaterialValueChoices,
  listWorkflowConnectionMaterialShapeChoices,
} from '../requirements/list-workflow-connection-material-value-choices.js';
import type { WorkflowConnectionMaterialValueChoice } from '../../../types/workflow-connection-evidence.js';

export function resolveConnectionGoals(
  input: WorkflowConnectionSessionSource,
  contracts: WorkflowPlanNodeContract[],
  proposals: WorkflowConnectionGoalProposal[],
): WorkflowConnectionSession['goals'] {
  if (!Array.isArray(proposals) || !proposals.length)
    throw new Error('Connection goals must cover the supplied requirements');
  const facts = new Set(input.requirements.map((item) => item.id));
  const covered = new Set<string>();
  let materialChoices: WorkflowConnectionMaterialValueChoice[] | undefined;
  let shapeChoices: WorkflowConnectionMaterialValueChoice[] | undefined;
  const goals = proposals.map((value) => {
    const decision = workflowConnectionGoalProposalSchema.parse(value);
    if (
      input.reviewBoundary === 'declared-contract' &&
      decision.kind === 'semantic'
    )
      throw new Error(
        'Declared-contract review requires code-checkable goals or an explicitly classified unsupported requirement; a free semantic verdict cannot add a proof obligation',
      );
    if (decision.kind === 'material-value') {
      if (materialChoices === undefined)
        materialChoices = listWorkflowConnectionMaterialValueChoices(
          describeWorkflowConnectionEvidence({
            source: input,
            graph: { edges: [], rootNodeIds: [], terminals: [] },
          }),
        );
      if (
        !materialChoices.some(
          (choice) =>
            choice.nodeId === decision.nodeId &&
            choice.materialKind === decision.materialKind &&
            choice.pointers.includes(decision.pointer),
        )
      )
        throw new Error(
          `Material-value goal ${decision.nodeId}: ${decision.materialKind}${decision.pointer} is not a current declared scalar configuration field`,
        );
      const apiId = input.materials?.some(
        (material) =>
          (material.status === 'ready'
            ? material.arguments.callId
            : material.callId) === decision.nodeId,
      );
      const nativeId = input.nativeNodes?.some(
        (node) => node.id === decision.nodeId,
      );
      if (decision.materialKind === 'native-material' ? !nativeId : !apiId)
        throw new Error(
          `Material-value goal ${decision.nodeId}: materialKind must match its supplied owner`,
        );
    }
    if (decision.kind === 'material-shape') {
      if (shapeChoices === undefined)
        shapeChoices = listWorkflowConnectionMaterialShapeChoices(
          describeWorkflowConnectionEvidence({
            source: input,
            graph: { edges: [], rootNodeIds: [], terminals: [] },
          }),
        );
      if (
        !shapeChoices.some(
          (choice) =>
            choice.nodeId === decision.nodeId &&
            choice.materialKind === decision.materialKind &&
            choice.pointers.includes(decision.pointer),
        )
      )
        throw new Error(
          `Material-shape goal ${decision.nodeId}: ${decision.pointer} is not a current declared container field`,
        );
    }
    if (decision.kind === 'operation-set') {
      const callIds = new Set(
        input.materials?.map((material) =>
          material.status === 'ready'
            ? material.arguments.callId
            : material.callId,
        ),
      );
      if (
        new Set(decision.nodeIds).size !== decision.nodeIds.length ||
        decision.nodeIds.some((id) => !callIds.has(id))
      )
        throw new Error(
          'Operation-set goals require distinct supplied API call IDs, never native nodes or hidden service implementation claims',
        );
    }
    if (
      new Set(decision.factIds).size !== decision.factIds.length ||
      decision.factIds.some((id) => !facts.has(id))
    )
      throw new Error(
        'Connection goal references unknown or duplicate requirements',
      );
    decision.factIds.forEach((id) => covered.add(id));
    return { id: `goal-${connectionValueFingerprint(decision)}`, decision };
  });
  if ([...facts].some((id) => !covered.has(id)))
    throw new Error('Connection goals omit a confirmed requirement');
  if (new Set(goals.map((goal) => goal.id)).size !== goals.length)
    throw new Error('Duplicate connection goals');
  const inspection = inspectWorkflowNodeConstraints({
    contracts,
    goals: goals.map((goal) => goal.decision),
    protectedEdges: (input.edges === undefined ? [] : input.edges).filter(
      (edge) =>
        !input.editableEdgeIds?.includes(workflowConnectionEdgeId(edge)),
    ),
  });
  if (inspection.conflicts.length)
    throw new WorkflowPlanningConstraintError(inspection);
  return goals;
}
