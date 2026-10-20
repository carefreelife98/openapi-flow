import { isDeepStrictEqual } from 'node:util';
import type { ValidateApiRequestMediaTypeDecisionInput } from '../../types/api-request-media-type-decision.js';
import { apiRequestMediaTypeDecisionSchema } from '../../schemas/api-request-media-type-decision-schema.js';
import { createApiRequestMediaTypeDecision } from './create-api-request-media-type-decision.js';

/** Verify recorded origin, declared choice/default policy and exact original sources. */
export function validateApiRequestMediaTypeDecision(
  input: ValidateApiRequestMediaTypeDecisionInput,
): void {
  const decision = apiRequestMediaTypeDecisionSchema.parse(input.decision);
  const expected = createApiRequestMediaTypeDecision({
    operation: input.operation,
    scenario: input.scenario,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    ...('assessment' in decision
      ? {
          assessment: {
            requestMediaType: decision.assessment.requestMediaType,
            ...(decision.assessment.explanation === undefined
              ? {}
              : {
                  explanation: {
                    reason: decision.assessment.explanation.reason,
                  },
                }),
          },
        }
      : {}),
  });
  if (!isDeepStrictEqual(decision, expected))
    throw new Error(
      'Request media decision differs from the original OAS, scenario, assessment or documented default policy',
    );
}
