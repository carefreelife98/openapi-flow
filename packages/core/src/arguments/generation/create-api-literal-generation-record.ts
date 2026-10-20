import type {
  CreateApiLiteralGenerationRecordInput,
  ApiLiteralGenerationRecord,
} from '../../types/api-literal-generation.js';
import { planningEvidenceTextSchema } from '../../schemas/planning-evidence-schema.js';
import { describeApiLiteralGeneration } from './describe-api-literal-generation.js';

/** Only literal proposals are attributed here; confirmed inputs and bindings remain code-owned. */
export function createApiLiteralGenerationRecord(
  input: CreateApiLiteralGenerationRecordInput,
): ApiLiteralGenerationRecord {
  const {
    input: snapshot,
    contract,
    context,
  } = describeApiLiteralGeneration(input);
  if (!contract.hasLiteralInputs) {
    if (input.proposal !== undefined || input.reason !== undefined)
      throw new Error(
        'Literal generation proposal and reason must be absent when no literal inputs remain',
      );
    return {
      kind: 'not-needed',
      callId: snapshot.callId,
      operation: structuredClone(snapshot.operation.key),
    };
  }
  if (input.proposal === undefined)
    throw new Error(
      'Literal generation proposal is required when literal inputs remain',
    );
  const proposal = contract.schema.parse(input.proposal);
  const reason = planningEvidenceTextSchema.parse(input.reason);
  return {
    kind: 'proposed-literals',
    callId: snapshot.callId,
    operation: structuredClone(snapshot.operation.key),
    proposedValues: structuredClone(proposal.values),
    explanation: {
      reason,
      evidence: [
        {
          kind: 'scenario',
          text: context.scenario,
          ...(context.purpose === undefined
            ? {}
            : { purpose: context.purpose }),
        },
        {
          kind: 'literal-input-contract',
          operation: context.operation,
          schema: context.literalInputSchema,
          ...(context.requestMediaType === undefined
            ? {}
            : { requestMediaType: context.requestMediaType }),
        },
      ],
    },
  };
}
