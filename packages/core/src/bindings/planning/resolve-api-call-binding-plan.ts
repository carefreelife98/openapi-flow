import type {
  ApiCallBindingPlan,
  ResolveApiCallBindingPlanInput,
} from '../../types/api-call-binding-planning.js';
import { apiCallBindingProposalSchema } from '../../schemas/api-call-binding-planning-schema.js';
import { resolveApiBindingSourceSelection } from './resolve-api-binding-source-selection.js';
import { describeApiCallBindingPlanning } from './describe-api-call-binding-planning.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';
import { createApiBindingSourceRegistry } from '../create-api-binding-source-registry.js';
import { validateRegisteredApiCallBindings } from '../validate-registered-api-call-bindings.js';
import { validateApiBindingGaps } from '../validate-api-binding-gaps.js';

export function resolveApiCallBindingPlan(
  input: ResolveApiCallBindingPlanInput,
): ApiCallBindingPlan {
  const description = describeApiCallBindingPlanning(input);
  const sources = resolveApiBindingSourceSelection({
    ...description.input,
    proposal: {
      sourceNodeIds: input.sources.sourceNodeIds,
      ...(input.sources.keySelections === undefined
        ? {}
        : { keySelections: input.sources.keySelections }),
      gaps: input.sources.gaps,
      ...(input.sources.reason === undefined
        ? {}
        : { reason: input.sources.reason }),
    },
  });
  if (!jsonValuesEqual(sources, input.sources))
    throw new Error(
      'binding sources differ from the original call, scenario or source contracts',
    );
  const proposal = apiCallBindingProposalSchema.parse(input.proposal);
  const bindings = proposal.bindings.map((binding) => ({
    ...binding,
    kind: 'node-output' as const,
  }));
  if (
    bindings.some(
      (binding) => !sources.sourceNodeIds.includes(binding.sourceNodeId),
    )
  )
    throw new Error(
      'binding references a source that was not selected and hydrated',
    );
  validateRegisteredApiCallBindings({
    callId: input.callId,
    bindings,
    registry: createApiBindingSourceRegistry(description.input),
    operation: 'resolveApiCallBindingPlan',
  });
  const gaps = [...sources.gaps, ...proposal.gaps].map((gap) => ({
    ...gap,
    callId: input.callId,
  }));
  validateApiBindingGaps({ ...description.input, plan: { calls: [], gaps } });
  return {
    fingerprint: description.fingerprint,
    callId: description.input.callId,
    sources,
    bindings,
    gaps,
    ...(input.includeExplanations === true && proposal.reason !== undefined
      ? { reason: proposal.reason }
      : {}),
  };
}
