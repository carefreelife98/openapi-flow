import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowConnectionRevision,
  WorkflowConnectionRevisionError,
  WorkflowPlanningConstraintError,
} from '@openapi-flow/core';
import type {
  CreateWorkflowConnectionRevisionRejectionInput,
  WorkflowConnectionRevisionRejection,
} from '../../types/workflow-connection-revision.js';
import { workflowConnectionRevisionRejectionSchema } from '../../schemas/workflow-connection-revision-rejection-schema.js';
import { WorkflowConnectionPlanningError } from './workflow-connection-planning-error.js';

/** Classify a lossless proposal rejection only. Never convert transport, cancellation or changed-source failures into retries. */
export function createWorkflowConnectionRevisionRejection(
  input: CreateWorkflowConnectionRevisionRejectionInput,
): WorkflowConnectionRevisionRejection | undefined {
  const { error } = input;
  if (
    !(error instanceof WorkflowConnectionPlanningError) ||
    error.diagnostic.operation !== 'planWorkflowConnectionRevision' ||
    !['model-output', 'contract-validation'].includes(error.diagnostic.stage)
  )
    return undefined;
  const current = describeWorkflowConnectionRevision(input);
  if (error.sourceFingerprint !== current.sourceFingerprint) return undefined;
  const parsed = workflowConnectionRevisionRejectionSchema.safeParse({
    sourceFingerprint: current.sourceFingerprint,
    expected: current.before.expected,
    stage: error.diagnostic.stage,
    code: error.diagnostic.code,
    output: error.output,
    reason: error.message,
    ...(error.cause instanceof WorkflowConnectionRevisionError
      ? { violations: error.cause.violations }
      : {}),
    ...(error.cause instanceof WorkflowPlanningConstraintError
      ? { constraints: error.cause.inspection }
      : {}),
  });
  if (!parsed.success || !isDeepStrictEqual(parsed.data.output, error.output))
    return undefined;
  return structuredClone(parsed.data);
}
