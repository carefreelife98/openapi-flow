import { isDeepStrictEqual } from 'node:util';
import type { PrepareWorkflowDraftEditInput } from '../../types/workflow-draft-edit-assembly.js';
import type { WorkflowDraftRequirement } from '../../types/workflow-draft.js';
import { describeWorkflowDraftClarificationScopes } from './describe-workflow-draft-clarification-scopes.js';
import { resolveWorkflowDraftClarificationScopes } from './resolve-workflow-draft-clarification-scopes.js';

/** The receipt is not authority: re-derive exact facts, provenance, states and selected-instance scopes. */
export function projectWorkflowDraftClarificationRequirements(
  input: PrepareWorkflowDraftEditInput,
): WorkflowDraftRequirement[] {
  if (input.context.clarification === undefined) {
    if (input.clarificationScopes !== undefined)
      throw new Error(
        'Clarification scope receipt requires its original context.clarification',
      );
    return [];
  }
  if (input.clarificationScopes === undefined) {
    if (describeWorkflowDraftClarificationScopes(input).requirements.length)
      throw new Error(
        'Active clarified facts/questions require an explicit clarificationScopes result before material planning',
      );
    return [];
  }
  const actual = resolveWorkflowDraftClarificationScopes({
    ...input,
    fingerprint: input.clarificationScopes.fingerprint,
    proposal: input.clarificationScopes.proposal,
  });
  if (!isDeepStrictEqual(actual, input.clarificationScopes))
    throw new Error(
      'Clarification scope receipt has modified requirements, states or provenance',
    );
  return actual.requirements;
}
