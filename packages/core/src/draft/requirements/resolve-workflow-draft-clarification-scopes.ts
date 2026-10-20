import { isDeepStrictEqual } from 'node:util';
import type {
  ResolveWorkflowDraftClarificationScopesInput,
  ResolvedWorkflowDraftClarificationScopes,
} from '../../types/workflow-draft-clarification.js';
import { describeWorkflowDraftClarificationScopes } from './describe-workflow-draft-clarification-scopes.js';
import { createWorkflowDraftClarificationScopeSchema } from '../../schemas/create-workflow-draft-clarification-scope-schema.js';
import { validateWorkflowPlanningEvidence } from '../../planning/evidence/validate-workflow-planning-evidence.js';

export function resolveWorkflowDraftClarificationScopes(
  input: ResolveWorkflowDraftClarificationScopesInput,
): ResolvedWorkflowDraftClarificationScopes {
  const description = describeWorkflowDraftClarificationScopes(input);
  if (input.fingerprint !== description.fingerprint)
    throw new Error(
      'Clarification scope fingerprint is stale or describes a different plan, reply or original contract',
    );
  const proposal = createWorkflowDraftClarificationScopeSchema(input).parse(
    input.proposal,
  );
  if (!isDeepStrictEqual(proposal, input.proposal))
    throw new Error(
      'Clarification scopes must validate without defaults, coercion or output repair',
    );
  for (const decision of Object.values(proposal.scopes))
    if (decision.explanation)
      validateWorkflowPlanningEvidence({
        context: { messages: description.messages },
        evidence: decision.explanation.evidence,
      });
  return {
    fingerprint: description.fingerprint,
    proposal,
    requirements: description.requirements.flatMap((requirement) => {
      const scope = proposal.scopes[requirement.id].scope;
      return scope.kind === 'unselected-work'
        ? []
        : [{ ...requirement, scope: structuredClone(scope) }];
    }),
    unselectedQuestionIds: description.requirements.flatMap((requirement) =>
      proposal.scopes[requirement.id].scope.kind === 'unselected-work'
        ? [requirement.origin!.sourceId]
        : [],
    ),
  };
}
