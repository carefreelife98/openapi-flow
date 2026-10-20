import type {
  ApiSelectionExplanation,
  CreateApiSelectionExplanationInput,
} from '../../../types/api-selection-evidence.js';
import { apiSelectionExplanationBasisSchema } from '../../../schemas/api-selection-evidence-schema.js';
import { planningEvidenceTextSchema } from '../../../schemas/planning-evidence-schema.js';
import { describeApiSelectionContext } from './describe-api-selection-context.js';
import { apiOperationKeyEquals } from '../../catalog/api-operation-key-equals.js';

/** Code attaches sources; the model supplies only its short user-facing reason. */
export function createApiSelectionExplanation(
  input: CreateApiSelectionExplanationInput,
): ApiSelectionExplanation {
  const context = describeApiSelectionContext(input.context);
  const reason = planningEvidenceTextSchema.parse(input.reason);
  const basis = apiSelectionExplanationBasisSchema.parse(input.basis);
  const candidates =
    basis.kind === 'catalog'
      ? context.operations
      : basis.operations.map((key, index) => {
          if (
            basis.operations
              .slice(0, index)
              .some((prior) => apiOperationKeyEquals(prior, key))
          )
            throw new Error('API selection explanation repeats a candidate');
          const candidate = context.operations.find((item) =>
            apiOperationKeyEquals(item.key, key),
          );
          if (!candidate)
            throw new Error(
              `API selection explanation references an unavailable candidate: ${key.documentId}${key.operationRef}`,
            );
          return candidate;
        });
  return {
    reason,
    evidence: [
      { kind: 'scenario', text: context.scenario },
      { kind: 'discovery', candidates },
    ],
  };
}
