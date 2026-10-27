import { isDeepStrictEqual } from 'node:util';
import type {
  CreateWorkflowConnectionOutlineRejectionInput,
  WorkflowConnectionOutlineRejection,
} from '../../types/workflow-connection-outline.js';
import { workflowConnectionOutlineRejectionSchema } from '../../schemas/workflow-connection-outline-rejection-schema.js';
import { describeWorkflowConnectionOutlineRequest } from './describe-workflow-connection-outline-request.js';
import { WorkflowConnectionPlanningError } from './workflow-connection-planning-error.js';

/** Classify only lossless proposal failures from this unchanged outline request. */
export function createWorkflowConnectionOutlineRejection(
  input: CreateWorkflowConnectionOutlineRejectionInput,
): WorkflowConnectionOutlineRejection | undefined {
  const { error } = input;
  if (
    !(error instanceof WorkflowConnectionPlanningError) ||
    error.diagnostic.operation !== 'planWorkflowConnectionOutline' ||
    !['model-output', 'contract-validation'].includes(error.diagnostic.stage) ||
    error.requestFingerprint === undefined
  )
    return undefined;
  const current = describeWorkflowConnectionOutlineRequest(input);
  if (
    error.requestFingerprint !== current.requestFingerprint ||
    error.sourceFingerprint !== current.description.expected.sourceFingerprint
  )
    return undefined;
  const parsed = workflowConnectionOutlineRejectionSchema.safeParse({
    requestFingerprint: current.requestFingerprint,
    expected: current.description.expected,
    stage: error.diagnostic.stage,
    code: error.diagnostic.code,
    output: error.output,
    reason: error.message,
  });
  if (!parsed.success || !isDeepStrictEqual(parsed.data.output, error.output))
    return undefined;
  return structuredClone(parsed.data);
}
