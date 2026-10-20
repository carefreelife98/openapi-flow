import { isDeepStrictEqual } from 'node:util';
import type { ValidateWorkflowClarificationAnswerRevisionInput } from '../../../types/workflow-clarification-answer-revision.js';
import { reviseWorkflowClarificationAnswers } from './revise-workflow-clarification-answers.js';

/** Reconstruct against the trusted pre-change context, not a receipt's claimed original state. */
export function validateWorkflowClarificationAnswerRevision(
  input: ValidateWorkflowClarificationAnswerRevisionInput,
): void {
  if (!input.revision || !input.revision.message)
    throw new Error(
      'Clarification answer revision requires its original receipt',
    );
  const result = reviseWorkflowClarificationAnswers({
    context: input.context,
    fingerprint: input.revision.fingerprint,
    messageId: input.revision.message.id,
    changes: input.revision.changes,
  });
  if (!isDeepStrictEqual(result.revision, input.revision))
    throw new Error(
      'Clarification answer revision has modified lineage, facts or evidence',
    );
}
