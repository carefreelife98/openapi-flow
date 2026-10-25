import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import { isDeepStrictEqual } from 'node:util';
import type { WorkflowConnectionSessionInput } from '../../../types/workflow-connection-session.js';
import type { ReviewableWorkflowGraphPlan } from '../../../types/reviewable-workflow.js';
import { inspectWorkflowConnectionCompletion } from './inspect-workflow-connection-completion.js';
import { createWorkflowConnectionPlan } from '../create-workflow-connection-plan.js';

export function finalizeWorkflowConnectionSession(
  input: WorkflowConnectionSessionInput,
): ReviewableWorkflowGraphPlan {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'finalizeWorkflowConnectionSession',
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
    },
    () => {
      const checked = inspectWorkflowConnectionCompletion(input);
      if (!checked.ready)
        throw new Error('Connection session is incomplete', { cause: checked });
      const plan = createWorkflowConnectionPlan({
        ...input,
        edges: input.session.edges,
        proposal: { edges: [], additionalGaps: [], blockedCalls: [] },
      });
      if (
        !isDeepStrictEqual(
          [...plan.starts].sort(),
          [...input.session.rootNodeIds].sort(),
        )
      )
        throw new Error('Final roots differ from explicitly planned roots');
      return plan;
    },
  );
}
