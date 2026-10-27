import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowConnectionGoals,
  WorkflowPlanningConstraintError,
} from '@openapi-flow/core';
import type {
  CreateWorkflowConnectionGoalRejectionInput,
  WorkflowConnectionGoalRejection,
} from '../../types/incremental-connection-planning.js';
import { workflowConnectionGoalRejectionSchema } from '../../schemas/workflow-connection-goal-rejection-schema.js';
import { WorkflowConnectionPlanningError } from './workflow-connection-planning-error.js';

/** Classify an unchanged-source proposal rejection. Other failures must remain failures. */
export function createWorkflowConnectionGoalRejection(
  input: CreateWorkflowConnectionGoalRejectionInput,
): WorkflowConnectionGoalRejection | undefined {
  const { error } = input;
  if (
    !(error instanceof WorkflowConnectionPlanningError) ||
    ![
      'planWorkflowConnectionGoals',
      'planWorkflowConnectionGoalRecovery',
    ].includes(error.diagnostic.operation) ||
    !['model-output', 'contract-validation'].includes(error.diagnostic.stage) ||
    error.sourceFingerprint === undefined
  )
    return undefined;
  const current = describeWorkflowConnectionGoals(input);
  if (error.sourceFingerprint !== current.sourceFingerprint) return undefined;
  const parsed = workflowConnectionGoalRejectionSchema.safeParse({
    sourceFingerprint: error.sourceFingerprint,
    stage: error.diagnostic.stage,
    code: error.diagnostic.code,
    output: error.output,
    reason: error.message,
    ...(error.cause instanceof WorkflowPlanningConstraintError
      ? { constraints: error.cause.inspection }
      : {}),
  });
  // Non-JSON results cannot be checkpointed losslessly; never repair them to enable a retry.
  if (!parsed.success || !isDeepStrictEqual(parsed.data.output, error.output))
    return undefined;
  return structuredClone(parsed.data);
}
