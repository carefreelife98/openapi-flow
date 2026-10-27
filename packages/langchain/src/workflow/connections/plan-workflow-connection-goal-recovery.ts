import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowConnectionGoals,
  describeWorkflowConnectionConflictMaterials,
  createWorkflowConnectionSession,
  validateWorkflowConnectionSourceRepairRequest,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type { WorkflowConnectionSourceRepairRequest } from '@openapi-flow/core';
import type {
  PlanWorkflowConnectionGoalRecoveryInput,
  PlanWorkflowConnectionGoalRecoveryResult,
  WorkflowConnectionGoalRecoveryDescription,
} from '../../types/workflow-connection-goal-recovery.js';
import { modelSignalSchema } from '../../schemas/model-signal-schema.js';
import { workflowConnectionGoalRejectionSchema } from '../../schemas/workflow-connection-goal-rejection-schema.js';
import { createWorkflowConnectionGoalRecoverySchema } from '../../schemas/workflow-connection-goal-recovery-schema.js';
import { workflowConnectionGoalRecoveryPrompt } from '../../prompts/workflow-connection-goal-recovery-prompt.js';
import { invokeConnectionPlanningModel } from './invoke-connection-planning-model.js';
import { resolveConnectionGoalSelections } from './resolve-connection-selections.js';
import { validateWorkflowGoalReviewFeedback } from './validate-workflow-goal-review-feedback.js';
import {
  WorkflowConnectionPlanningError,
  validateConnectionProposal,
} from './workflow-connection-planning-error.js';

function describeRecovery(
  input: PlanWorkflowConnectionGoalRecoveryInput,
): WorkflowConnectionGoalRecoveryDescription {
  modelSignalSchema.parse(input.signal);
  const description = describeWorkflowConnectionGoals(input);
  const reviews = validateWorkflowGoalReviewFeedback(input);
  if (
    !Array.isArray(input.rejectedProposals) ||
    (!input.rejectedProposals.length && !reviews.length)
  )
    throw new Error('Goal recovery requires rejectedProposals');
  for (const value of input.rejectedProposals) {
    const checked = workflowConnectionGoalRejectionSchema.parse(value);
    if (
      !isDeepStrictEqual(value, checked) ||
      value.sourceFingerprint !== description.sourceFingerprint
    )
      throw new Error(
        'Goal recovery requires unchanged source and lossless rejection evidence',
      );
  }
  const nodes = [
    ...new Set(
      input.rejectedProposals
        .flatMap((rejection) =>
          rejection.stage === 'contract-validation' &&
          rejection.constraints !== undefined
            ? rejection.constraints.conflicts.flatMap(
                (conflict) => conflict.nodeIds,
              )
            : [],
        )
        .concat(
          reviews.length
            ? description.context.nodes.map((node) => node.id)
            : [],
        ),
    ),
  ];
  if (!nodes.length && !reviews.length)
    throw new Error('Goal recovery requires code-owned conflict evidence');
  return {
    ...description,
    conflictMaterials:
      nodes.length === 0
        ? { apiCalls: [], nativeNodes: [], apiResponseContracts: [] }
        : describeWorkflowConnectionConflictMaterials({
            source: input,
            nodeIds: nodes,
          }),
    rejectedProposals: structuredClone(input.rejectedProposals),
    ...(input.rejectedGoalReviews === undefined
      ? {}
      : { rejectedGoalReviews: reviews }),
  };
}

/** One reconsideration before any accepted session exists. The host owns originating-stage invocation and budgets. */
export async function planWorkflowConnectionGoalRecovery(
  input: PlanWorkflowConnectionGoalRecoveryInput,
): Promise<PlanWorkflowConnectionGoalRecoveryResult> {
  const operation = 'planWorkflowConnectionGoalRecovery';
  const description = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation,
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => describeRecovery(input),
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
        if (!isDeepStrictEqual(describeRecovery(input), description))
          throw new Error(
            'Goal recovery source or rejection evidence changed during model invocation',
          );
      },
    );
  const output = await invokeConnectionPlanningModel({
    model: input.model,
    operation,
    name: 'plan_workflow_connection_goal_recovery',
    schema: createWorkflowConnectionGoalRecoverySchema(description),
    sourceFingerprint: description.sourceFingerprint,
    messages: [
      new SystemMessage(workflowConnectionGoalRecoveryPrompt),
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
    () => {
      if (output.decision.kind === 'goals')
        return {
          kind: 'goals' as const,
          session: createWorkflowConnectionSession({
            ...input,
            goals: resolveConnectionGoalSelections(
              output.decision.goals,
              description.context.nodes,
            ),
          }),
        };
      const request: WorkflowConnectionSourceRepairRequest = {
        kind: 'replan-materials',
        sourceFingerprint: description.sourceFingerprint,
        request: output.decision,
      };
      validateWorkflowConnectionSourceRepairRequest({ source: input, request });
      return request;
    },
  );
}
