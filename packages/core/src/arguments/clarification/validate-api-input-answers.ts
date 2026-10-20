import type {
  ValidateApiInputAnswersInput,
  ApiInputAnswersResult,
  ApiAnswerIssue,
  ConfirmedApiInput,
} from '../../types/api-clarification.js';
import { apiInputAnswersSchema } from '../../schemas/confirmed-api-input-schema.js';
import { apiOperationKeyEquals } from '../../openapi/catalog/api-operation-key-equals.js';
import { createOasValueValidator } from '../../openapi/common/create-oas-value-validator.js';
import { listMissingRequestedApiInputs } from './list-missing-requested-api-inputs.js';

export function validateApiInputAnswers(
  input: ValidateApiInputAnswersInput,
): ApiInputAnswersResult {
  if (!Array.isArray(input.requirements) || !Array.isArray(input.operations))
    throw new Error(
      'validateApiInputAnswers.requirements and operations must be arrays',
    );
  const parsed = apiInputAnswersSchema.safeParse(input.answers);
  if (!parsed.success)
    return {
      status: 'invalid-answer',
      issues: parsed.error.issues.map((issue) => ({
        requirementId: '',
        message: issue.message,
      })),
    };
  const issues: ApiAnswerIssue[] = [];
  const confirmedInputs: ConfirmedApiInput[] = [];
  const seen = new Set<string>();
  for (const answer of parsed.data) {
    const requirement = input.requirements.find(
      (item) => item.id === answer.requirementId,
    );
    if (!requirement || seen.has(answer.requirementId)) {
      issues.push({
        requirementId: answer.requirementId,
        message: 'Unknown or duplicate requirementId',
      });
      continue;
    }
    seen.add(answer.requirementId);
    if (
      !input.operations.some((operation) =>
        apiOperationKeyEquals(operation, requirement.operation),
      )
    )
      throw new Error(
        `Input requirement ${requirement.id} belongs to a stale OAS snapshot`,
      );
    const checked = createOasValueValidator(
      requirement.schema,
      requirement.openapiVersion.startsWith('3.0.')
        ? 'openapi-3.0'
        : 'draft-2020-12',
      `answer ${requirement.targetPointer}`,
    ).validate(answer.value);
    if (!checked.valid) {
      issues.push({
        requirementId: requirement.id,
        message: checked.errors.map((error) => error.message).join('; '),
      });
      continue;
    }
    const missing = listMissingRequestedApiInputs({
      source: `Answer ${requirement.id}`,
      rootPointer: requirement.targetPointer,
      value: answer.value,
      requestedInputs: requirement.requestedInputs,
    });
    if (missing.length) {
      issues.push({
        requirementId: requirement.id,
        message: `Answer omits scenario-requested inputs: ${missing.join(', ')}`,
      });
      continue;
    }
    confirmedInputs.push({
      callId: requirement.callId,
      operation: structuredClone(requirement.operation),
      targetPointer: requirement.targetPointer,
      value: structuredClone(answer.value),
    });
  }
  return issues.length
    ? { status: 'invalid-answer', issues }
    : { status: 'accepted', confirmedInputs };
}
