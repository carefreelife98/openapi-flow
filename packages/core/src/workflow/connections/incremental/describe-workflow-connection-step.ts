import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import type {
  WorkflowConnectionSessionInput,
  WorkflowConnectionStepDescription,
} from '../../../types/workflow-connection-session.js';
import { validateWorkflowConnectionSession } from './validate-workflow-connection-session.js';
import { inspectWorkflowConnectionCompletion } from './inspect-workflow-connection-completion.js';
import { workflowConnectionEdgeId } from './connection-graph-identity.js';

export function describeWorkflowConnectionStep(
  input: WorkflowConnectionSessionInput,
): WorkflowConnectionStepDescription {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'describeWorkflowConnectionStep',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const { source, fingerprint, apiOperations } =
        validateWorkflowConnectionSession(input);
      const protectedIds = new Set(
        source.input.edges
          .map(workflowConnectionEdgeId)
          .filter((id) => !input.editableEdgeIds?.includes(id)),
      );
      return {
        apiOperations,
        expected: {
          sessionId: input.session.id,
          sourceFingerprint: fingerprint,
          revision: input.session.revision,
        },
        context: {
          ...structuredClone(source.context),
          edges: structuredClone(input.session.edges),
        },
        requirements: structuredClone(input.requirements),
        goals: structuredClone(input.session.goals),
        edgeCatalog: input.session.edges.map((edge) => ({
          id: workflowConnectionEdgeId(edge),
          edge: structuredClone(edge),
          editable: !protectedIds.has(workflowConnectionEdgeId(edge)),
        })),
        rootNodeIds: [...input.session.rootNodeIds],
        terminals: structuredClone(input.session.terminals),
        inspection: inspectWorkflowConnectionCompletion(input),
      };
    },
  );
}
