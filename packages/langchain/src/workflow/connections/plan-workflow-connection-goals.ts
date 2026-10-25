import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowConnectionGoals,
  createWorkflowConnectionSession,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionGoalProposal,
  WorkflowConnectionSession,
} from '@openapi-flow/core';
import type { PlanWorkflowConnectionGoalsInput } from '../../types/incremental-connection-planning.js';
import { createWorkflowConnectionGoalsSchema } from '../../schemas/workflow-connection-goals-schema.js';
import { workflowConnectionGoalRejectionSchema } from '../../schemas/workflow-connection-goal-rejection-schema.js';
import { workflowConnectionGoalsPrompt } from '../../prompts/incremental-workflow-connections-prompt.js';
import { invokeConnectionPlanningModel } from './invoke-connection-planning-model.js';
import { resolveConnectionPortSelection } from './resolve-connection-port-selection.js';
import { validateConnectionProposal } from './workflow-connection-planning-error.js';

/** One semantic interpretation; code validates coverage/identities and creates the initial session. */
export async function planWorkflowConnectionGoals(
  input: PlanWorkflowConnectionGoalsInput,
): Promise<WorkflowConnectionSession> {
  const operation = 'planWorkflowConnectionGoals';
  const { description, schema } = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation,
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const description = describeWorkflowConnectionGoals(input);
      if (input.rejectedProposals !== undefined) {
        if (!Array.isArray(input.rejectedProposals))
          throw new Error('rejectedProposals must be an array when supplied');
        for (const rejection of input.rejectedProposals) {
          workflowConnectionGoalRejectionSchema.parse(rejection);
          if (rejection.sourceFingerprint !== description.sourceFingerprint)
            throw new Error(
              'Rejected goals must belong to the unchanged source and requirements',
            );
        }
      }
      return {
        description,
        schema: createWorkflowConnectionGoalsSchema(description),
      };
    },
  );
  const output = await invokeConnectionPlanningModel({
    model: input.model,
    operation,
    name: 'plan_workflow_connection_goals',
    schema,
    sourceFingerprint: description.sourceFingerprint,
    messages: [
      new SystemMessage(workflowConnectionGoalsPrompt),
      new HumanMessage(
        JSON.stringify({
          ...description,
          ...(input.rejectedProposals === undefined
            ? {}
            : { rejectedProposals: input.rejectedProposals }),
        }),
      ),
    ],
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  return validateConnectionProposal(
    {
      operation,
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
      output,
      sourceFingerprint: description.sourceFingerprint,
    },
    () => {
      if (
        describeWorkflowConnectionGoals(input).sourceFingerprint !==
        description.sourceFingerprint
      )
        throw new Error(
          'Connection goal source changed during model invocation',
        );
      const goals: WorkflowConnectionGoalProposal[] = output.goals.map(
        (goal) =>
          goal.kind !== 'route'
            ? goal
            : {
                kind: goal.kind,
                from: goal.source.nodeId,
                to: goal.to,
                factIds: goal.factIds,
                reason: goal.reason,
                output: resolveConnectionPortSelection(
                  goal.source,
                  description.context.nodes,
                  'outputs',
                ),
              },
      );
      return createWorkflowConnectionSession({ ...input, goals });
    },
  );
}
