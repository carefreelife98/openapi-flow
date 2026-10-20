import type { ApiInputAnswerContext } from '../../../types/api-input-answer-extraction.js';
import { apiInputAnswerContextSchema } from '../../../schemas/api-input-answer-extraction-schema.js';
import { createOasValueValidator } from '../../../openapi/common/create-oas-value-validator.js';

/** Capture supplied pending contracts before any asynchronous model work. */
export function captureApiInputAnswerContext(
  input: ApiInputAnswerContext,
): ApiInputAnswerContext {
  apiInputAnswerContextSchema.parse(input);
  const snapshot = structuredClone(input);
  const ids = new Set<string>();
  for (const requirement of snapshot.requirements) {
    if (ids.has(requirement.id))
      throw new Error(`Duplicate API input requirementId: ${requirement.id}`);
    ids.add(requirement.id);
    createOasValueValidator(
      requirement.schema,
      requirement.openapiVersion.startsWith('3.0.')
        ? 'openapi-3.0'
        : 'draft-2020-12',
      `API input requirement ${requirement.id} ${requirement.targetPointer}`,
    );
  }
  return snapshot;
}
