import { isDeepStrictEqual } from 'node:util';
import type { WorkflowConnectionSessionSource } from '../../../types/workflow-connection-session.js';
import { pointerValue } from '../../../bindings/json-pointer.js';
import { verifyApiInputLiteralSource } from '../../../arguments/sources/verify-api-input-literal-source.js';
import type { JsonValue } from '../../../types/api-arguments.js';
import { workflowNonemptySourceMessagesSchema } from '../../../schemas/planning-evidence-schema.js';
import { validateApiInputAnswerAnalysis } from '../../../arguments/clarification/extraction/validate-api-input-answer-analysis.js';
import { jsonValuesEqual } from '../../../utils/json-values-equal.js';

/** Recheck the argument owner's exact-source receipts against CURRENT values before semantic review. */
export function validateWorkflowConnectionLiteralAttribution(
  input: WorkflowConnectionSessionSource,
): void {
  if (input.literalSourceMessages !== undefined)
    workflowNonemptySourceMessagesSchema.parse(input.literalSourceMessages);
  if (
    input.literalSourceMessages !== undefined &&
    new Set(input.literalSourceMessages.map((message) => message.id)).size !==
      input.literalSourceMessages.length
  )
    throw new Error(
      'literalSourceMessages requires distinct original message IDs',
    );
  for (const material of input.materials === undefined ? [] : input.materials) {
    if (material.status !== 'ready') continue;
    const interpretation = material.arguments.enumInterpretation;
    if (interpretation !== undefined) {
      if (
        input.literalSourceMessages === undefined ||
        interpretation.sourceMessages === undefined
      )
        throw new Error(
          `materials[${material.arguments.callId}].enumInterpretation requires original literalSourceMessages and recorded sourceMessages`,
        );
      for (const message of interpretation.sourceMessages)
        if (
          !input.literalSourceMessages.some((current) =>
            isDeepStrictEqual(current, message),
          )
        )
          throw new Error(
            `materials[${material.arguments.callId}].enumInterpretation cites missing or changed original messages`,
          );
      validateApiInputAnswerAnalysis(interpretation);
      for (const answer of interpretation.analysis.answers) {
        const requirement = interpretation.requirements.find(
          (item) => item.id === answer.requirementId,
        );
        if (!requirement)
          throw new Error(
            `materials[${material.arguments.callId}].enumInterpretation is missing original requirement ${answer.requirementId}`,
          );
        if (
          requirement.callId !== material.arguments.callId ||
          !isDeepStrictEqual(requirement.operation, material.operation.key) ||
          !jsonValuesEqual(
            pointerValue(material.arguments.values, requirement.targetPointer),
            answer.value,
          )
        )
          throw new Error(
            `materials[${material.arguments.callId}].enumInterpretation differs from the current operation or configured value for ${requirement.targetPointer}`,
          );
      }
    }
    if (material.arguments.literalSources === undefined) continue;
    if (input.literalSourceMessages === undefined)
      throw new Error(
        `materials[${material.arguments.callId}].literalSources requires original literalSourceMessages`,
      );
    for (const source of material.arguments.literalSources) {
      const message = input.literalSourceMessages.find(
        (item) => item.id === source.messageId,
      );
      const value = pointerValue(
        material.arguments.values,
        source.targetPointer,
      );
      const label = `materials[${material.arguments.callId}].literalSources[${source.targetPointer}]`;
      if (message === undefined || value === undefined)
        throw new Error(
          `${label} requires its original message and current configured value`,
        );
      const verified = verifyApiInputLiteralSource({
        ...source,
        text: message.text,
        value: value as JsonValue,
        label,
      });
      if (!isDeepStrictEqual(verified.occurrences, source.occurrences))
        throw new Error(
          `${label} differs from its original verified source locations`,
        );
    }
  }
}
