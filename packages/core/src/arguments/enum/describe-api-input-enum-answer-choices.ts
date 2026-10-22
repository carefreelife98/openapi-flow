import type { ApiInputAnswerContext } from '../../types/api-input-answer-extraction.js';
import type { ApiInputEnumAnswerChoice } from '../../types/api-input-enum-answers.js';
import { captureApiInputAnswerContext } from '../clarification/extraction/capture-api-input-answer-context.js';
import { createOasValueValidator } from '../../openapi/common/create-oas-value-validator.js';
import { createSchemaResourceContext } from '../../bindings/resources/create-schema-resource-context.js';
import { listApiInputEnumCandidates } from './list-api-input-enum-candidates.js';
import { apiInputRequirementDialect } from '../clarification/api-input-requirement-dialect.js';

/** Pending question contracts are the only value authority; defaults/examples are not candidates. */
export function describeApiInputEnumAnswerChoices(
  input: ApiInputAnswerContext,
): ApiInputEnumAnswerChoice[] {
  const context = captureApiInputAnswerContext(input);
  if (context.selectOasEnums !== true) return [];
  return context.requirements.flatMap((requirement) => {
    const normalized = createOasValueValidator(
      requirement.schema,
      apiInputRequirementDialect(requirement),
      `API enum answer ${requirement.id}`,
    ).schema;
    const resources = createSchemaResourceContext(normalized);
    const candidates = listApiInputEnumCandidates({
      source: { kind: 'requirement', requirement },
      schemas: [resources.reference(resources.root)],
      resources,
    });
    return candidates.length
      ? [{ requirementId: requirement.id, candidates }]
      : [];
  });
}
