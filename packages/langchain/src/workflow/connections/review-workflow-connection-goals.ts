import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowConnectionGoalReview,
  createWorkflowConnectionGoalReview,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type { WorkflowConnectionGoalReview } from '@openapi-flow/core';
import type { ReviewWorkflowConnectionGoalsInput } from '../../types/workflow-connection-goal-review.js';
import { createWorkflowConnectionGoalReviewSchema } from '../../schemas/workflow-connection-goal-review-schema.js';
import { modelSignalSchema } from '../../schemas/model-signal-schema.js';
import { workflowConnectionGoalReviewPrompt } from '../../prompts/workflow-connection-goal-review-prompt.js';
import { invokeConnectionPlanningModel } from './invoke-connection-planning-model.js';
import {
  WorkflowConnectionPlanningError,
  validateConnectionProposal,
} from './workflow-connection-planning-error.js';

/** One independent judgment; the host owns whether and how to replan rejected goals/material. */
export async function reviewWorkflowConnectionGoals(
  input: ReviewWorkflowConnectionGoalsInput,
): Promise<WorkflowConnectionGoalReview> {
  const operation = 'reviewWorkflowConnectionGoals';
  const description = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation,
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      modelSignalSchema.parse(input.signal);
      return describeWorkflowConnectionGoalReview(input);
    },
  );
  const checkCurrent = (output: unknown): void =>
    validateConnectionProposal(
      {
        operation,
        stage: 'input-validation',
        code: 'PLANNING_INPUT_INVALID',
        output,
        sourceFingerprint: description.sourceFingerprint,
      },
      () => {
        if (
          !isDeepStrictEqual(
            description,
            describeWorkflowConnectionGoalReview(input),
          )
        )
          throw new Error(
            'Goal review source or candidate changed during model invocation',
          );
      },
    );
  const output = await invokeConnectionPlanningModel({
    model: input.model,
    operation,
    name: 'review_workflow_connection_goals',
    schema: createWorkflowConnectionGoalReviewSchema(description),
    sourceFingerprint: description.sourceFingerprint,
    messages: [
      new SystemMessage(workflowConnectionGoalReviewPrompt),
      new HumanMessage(JSON.stringify(description)),
    ],
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  }).catch((error: unknown) => {
    if (
      error instanceof WorkflowConnectionPlanningError &&
      error.diagnostic.stage === 'model-output'
    )
      checkCurrent(error.output);
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
    () =>
      createWorkflowConnectionGoalReview({
        ...input,
        proposal: {
          assessments: description.requirements.map((fact) => ({
            factId: fact.id,
            ...output.assessments[fact.id]!,
          })),
        },
      }),
  );
}
