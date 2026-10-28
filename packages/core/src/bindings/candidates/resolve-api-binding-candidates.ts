import type { ResolveApiBindingCandidatesInput } from '../../types/api-binding-candidates.js';
import type { ApiCallBindingPlan } from '../../types/api-call-binding-planning.js';
import { describeApiBindingCandidates } from './describe-api-binding-candidates.js';
import { resolveBindingPointerTemplate } from './resolve-binding-pointer-template.js';
import { resolveApiCallBindingPlan } from '../planning/resolve-api-call-binding-plan.js';

export function resolveApiBindingCandidates(
  input: ResolveApiBindingCandidatesInput,
): ApiCallBindingPlan {
  const catalog = describeApiBindingCandidates(input);
  const candidates = new Map(
    catalog.candidates.map((candidate) => [candidate.id, candidate]),
  );
  return resolveApiCallBindingPlan({
    ...input,
    proposal: {
      ...input.proposal,
      bindings: input.proposal.bindings.map((choice) => {
        const candidate = candidates.get(choice.candidateId);
        if (!candidate)
          throw new Error(
            `Unknown or stale binding candidate ${choice.candidateId}`,
          );
        return {
          sourceNodeId: candidate.sourceNodeId,
          sourcePointer: resolveBindingPointerTemplate(
            candidate.source,
            choice.sourceSelections,
          ),
          targetPointer: resolveBindingPointerTemplate(
            candidate.target,
            choice.targetSelections,
          ),
        };
      }),
    },
  });
}
