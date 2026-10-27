import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
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
import { resolveConnectionGoalSelections } from './resolve-connection-selections.js';
import {
  validateConnectionProposal,
  WorkflowConnectionPlanningError,
} from './workflow-connection-planning-error.js';
import { validateWorkflowGoalReviewFeedback } from './validate-workflow-goal-review-feedback.js';

/** One semantic interpretation; code validates coverage/identities and creates the initial session. */
export async function planWorkflowConnectionGoals(
  input: PlanWorkflowConnectionGoalsInput,
): Promise<WorkflowConnectionSession> {
  const operation = 'planWorkflowConnectionGoals';
  const { description, schema, rejectedGoalReviews } = runOpenApiFlowOperation(
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
        rejectedGoalReviews: validateWorkflowGoalReviewFeedback(input),
        schema: createWorkflowConnectionGoalsSchema(description),
      };
    },
  );
  const checkCurrent = (output: unknown, originalFailure?: unknown): void =>
    validateConnectionProposal(
      {
        operation,
        stage: 'input-validation',
        code: 'PLANNING_INPUT_INVALID',
        output,
        sourceFingerprint: description.sourceFingerprint,
      },
      () => {
        try {
          if (
            describeWorkflowConnectionGoals(input).sourceFingerprint !==
              description.sourceFingerprint ||
            !isDeepStrictEqual(
              validateWorkflowGoalReviewFeedback(input),
              rejectedGoalReviews,
            )
          )
            throw new Error(
              'Connection goal source or review evidence changed during model invocation',
            );
        } catch (error) {
          if (originalFailure === undefined) throw error;
          throw new AggregateError(
            [originalFailure, error],
            'Connection goal source or review evidence changed during malformed model output',
            { cause: error },
          );
        }
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
          ...(input.rejectedGoalReviews === undefined
            ? {}
            : { rejectedGoalReviews }),
        }),
      ),
    ],
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  }).catch((error: unknown) => {
    if (
      error instanceof WorkflowConnectionPlanningError &&
      error.diagnostic.stage === 'model-output'
    )
      checkCurrent(error.output, error);
    throw error;
  });
  checkCurrent(output);
  return validateConnectionProposal(
    {
      operation,
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
      output,
      sourceFingerprint: description.sourceFingerprint,
    },
    () => {
      const goals: WorkflowConnectionGoalProposal[] =
        resolveConnectionGoalSelections(
          output.goals,
          description.context.nodes,
        );
      return createWorkflowConnectionSession({ ...input, goals });
    },
  );
}
