import { isDeepStrictEqual } from 'node:util';
import type { WorkflowClarificationRoundInput } from '../../types/workflow-clarification.js';
import { workflowPlanningContextFingerprint } from '../../planning/evidence/workflow-planning-context-fingerprint.js';
import { createWorkflowClarificationRound } from './create-workflow-clarification-round.js';
import { proposalFromClarificationRound } from './proposal-from-clarification-round.js';

/** Host-owned question data must match the current sources and original shape. */
export function validateWorkflowClarificationRound(
  input: WorkflowClarificationRoundInput,
): void {
  const fingerprint = workflowPlanningContextFingerprint(input.context);
  if (!input.round || input.round.contextFingerprint !== fingerprint)
    throw new Error(
      'Clarification round is missing or stale for planning context',
    );
  let expected;
  try {
    expected = createWorkflowClarificationRound({
      context: input.context,
      limits: input.round.limits,
      options: input.round.options,
      proposal: proposalFromClarificationRound(input.round),
    });
  } catch (cause) {
    throw new Error(
      'Invalid clarification round: questions, sources or settings do not match the contract',
      { cause },
    );
  }
  if (!isDeepStrictEqual(expected, input.round))
    throw new Error(
      'Clarification round has modified identities, fields or settings',
    );
}
