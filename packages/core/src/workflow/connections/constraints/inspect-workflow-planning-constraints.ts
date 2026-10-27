import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import { workflowPlanningConstraintGoalsSchema } from '../../../schemas/workflow-planning-constraint-schema.js';
import type {
  InspectWorkflowPlanningConstraintsInput,
  WorkflowPlanningConstraintInspection,
} from '../../../types/workflow-planning-constraints.js';
import { describeWorkflowConnectionPlanning } from '../describe-workflow-connection-planning.js';
import { workflowConnectionEdgeId } from '../incremental/connection-graph-identity.js';
import { inspectWorkflowNodeConstraints } from './inspect-workflow-node-constraints.js';

/** Inspect original materials without a model call or a partially executable workflow. */
export function inspectWorkflowPlanningConstraints(
  input: InspectWorkflowPlanningConstraintsInput,
): WorkflowPlanningConstraintInspection {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'inspectWorkflowPlanningConstraints',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const description = describeWorkflowConnectionPlanning(input);
      const goals =
        input.goals === undefined
          ? []
          : workflowPlanningConstraintGoalsSchema.parse(input.goals);
      const edgeIds = new Set(
        description.input.edges.map(workflowConnectionEdgeId),
      );
      const editable = input.editableEdgeIds;
      if (
        editable !== undefined &&
        (!Array.isArray(editable) ||
          new Set(editable).size !== editable.length ||
          editable.some((id) => !edgeIds.has(id)))
      )
        throw new Error(
          'editableEdgeIds must name distinct original connection edges',
        );
      return inspectWorkflowNodeConstraints({
        contracts: description.context.nodes,
        goals,
        protectedEdges: description.input.edges.filter(
          (edge) => !editable?.includes(workflowConnectionEdgeId(edge)),
        ),
      });
    },
  );
}
