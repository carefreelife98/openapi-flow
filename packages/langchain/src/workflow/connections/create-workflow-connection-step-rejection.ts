import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowConnectionStep,
  WorkflowConnectionRegionValidationError,
  workflowConnectionRejectedProposalSchema,
} from '@openapi-flow/core';
import type { WorkflowConnectionRejectedProposal } from '@openapi-flow/core';
import type { CreateWorkflowConnectionStepRejectionInput } from '../../types/workflow-connection-proposal-attempt.js';
import { createWorkflowConnectionRegionSelectionSchema } from '../../schemas/workflow-connection-region-selection-schema.js';
import { resolveWorkflowConnectionRegionSelection } from './resolve-workflow-connection-region-selection.js';
import { WorkflowConnectionPlanningError } from './workflow-connection-planning-error.js';

/** Typed planning-rule rejection only. Never classify arbitrary exceptions by their message. */
export function createWorkflowConnectionStepRejection(
  input: CreateWorkflowConnectionStepRejectionInput,
): WorkflowConnectionRejectedProposal | undefined {
  const error = input.error;
  if (
    !(error instanceof WorkflowConnectionPlanningError) ||
    !(error.cause instanceof WorkflowConnectionRegionValidationError) ||
    error.diagnostic.operation !== 'planWorkflowConnectionStep' ||
    error.diagnostic.stage !== 'contract-validation'
  )
    return undefined;
  if (
    !error.proposalAttempt ||
    error.proposalAttempt.capture.status !== 'captured'
  )
    return undefined;
  const description = describeWorkflowConnectionStep(input);
  if (!isDeepStrictEqual(error.proposalAttempt.expected, description.expected))
    throw new Error(
      'Connection rejection belongs to a stale session/source/revision',
    );
  const original = error.cause;
  if (!isDeepStrictEqual(error.output, error.proposalAttempt.capture.output))
    throw new Error(
      'Connection rejection output differs from its captured proposal',
    );
  const captured = error.proposalAttempt.capture.output;
  if (
    !captured ||
    typeof captured !== 'object' ||
    Array.isArray(captured) ||
    !('decision' in captured)
  )
    throw new Error('Connection rejection capture requires decision');
  const selection = createWorkflowConnectionRegionSelectionSchema(
    description,
  ).parse(captured.decision);
  try {
    resolveWorkflowConnectionRegionSelection(description, selection);
  } catch (replayed) {
    if (!(replayed instanceof WorkflowConnectionRegionValidationError))
      throw replayed;
    if (
      !isDeepStrictEqual(replayed.region, original.region) ||
      !isDeepStrictEqual(replayed.violations, original.violations)
    )
      throw new Error(
        'Connection region rejection differs from current source validation',
        { cause: replayed },
      );
    return workflowConnectionRejectedProposalSchema.parse({
      expected: description.expected,
      proposal: original.region,
      violations: original.violations,
    });
  }
  throw new Error(
    'Connection region rejection no longer violates its current source',
  );
}
