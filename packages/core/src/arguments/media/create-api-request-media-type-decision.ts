import type {
  ApiRequestMediaTypeDecision,
  CreateApiRequestMediaTypeDecisionInput,
} from '../../types/api-request-media-type-decision.js';
import { apiRequestMediaTypeAssessmentProposalSchema } from '../../schemas/api-request-media-type-decision-schema.js';
import { describeApiRequestMediaTypeContext } from './describe-api-request-media-type-context.js';
import { selectDefaultApiRequestMediaType } from './select-default-api-request-media-type.js';
import { object } from '../../openapi/common/parse-spec-utils.js';

/** Resolves a declared choice or the approved explicit-null default, never invalid output. */
export function createApiRequestMediaTypeDecision(
  input: CreateApiRequestMediaTypeDecisionInput,
): ApiRequestMediaTypeDecision {
  const context = describeApiRequestMediaTypeContext(input);
  const fields = {
    operation: context.operation.key,
    declaredMediaTypes: context.mediaTypes,
  };
  if (context.mediaTypes.length < 2) {
    if (input.assessment !== undefined)
      throw new Error(
        'Request media assessment must be absent when code owns the zero/one-format decision',
      );
    return context.operation.requestBody === undefined
      ? { ...fields, kind: 'no-request-body' }
      : {
          ...fields,
          kind: 'single-declared-format',
          requestMediaType: context.mediaTypes[0],
        };
  }
  if (input.assessment === undefined)
    throw new Error(
      `${context.operation.key.operationRef} requires an explicit request media assessment for multiple formats`,
    );
  const assessment = apiRequestMediaTypeAssessmentProposalSchema.parse(
    input.assessment,
  );
  const requestBody = object(
    context.operation.requestBody,
    `${context.operation.key.operationRef}.requestBody`,
  );
  if (
    assessment.requestMediaType !== null &&
    !context.mediaTypes.includes(assessment.requestMediaType)
  )
    throw new Error(
      `${context.operation.key.operationRef} assessment.requestMediaType is not a declared requestBody.content key`,
    );
  const explanation =
    assessment.explanation === undefined
      ? {}
      : {
          explanation: {
            reason: assessment.explanation.reason,
            evidence: [
              {
                kind: 'scenario' as const,
                text: context.scenario,
                ...(context.purpose === undefined
                  ? {}
                  : { purpose: context.purpose }),
              },
              {
                kind: 'oas-request-body' as const,
                operation: structuredClone(context.operation.key),
                pointer: '/requestBody' as const,
                value: requestBody,
              },
            ],
          },
        };
  if (assessment.requestMediaType === null) {
    const selected = selectDefaultApiRequestMediaType(input.operation);
    if (selected === undefined)
      throw new Error(
        'Declared request body did not produce a default media type',
      );
    return {
      ...fields,
      kind: 'documented-default',
      requestMediaType: selected,
      policy: 'json-form-concrete-wildcard-code-point',
      assessment: { requestMediaType: null, ...explanation },
    };
  }
  return {
    ...fields,
    kind: 'model-selection',
    requestMediaType: assessment.requestMediaType,
    assessment: {
      requestMediaType: assessment.requestMediaType,
      ...explanation,
    },
  };
}
