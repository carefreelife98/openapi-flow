import { describeApiArgumentEnumContext } from '@openapi-flow/core';
import type { RequestedApiEnumTargetsInput } from '../types/argument-generation.js';

/** OAS and requested input paths own dispatch; model explanations never schedule work. */
export function listRequestedApiEnumTargets(
  input: RequestedApiEnumTargetsInput,
): string[] {
  const context = describeApiArgumentEnumContext(input);
  return context.requirements
    .filter((requirement) =>
      input.requestedInputs.some(
        (pointer) =>
          requirement.targetPointer === pointer ||
          requirement.targetPointer.startsWith(pointer + '/'),
      ),
    )
    .map((requirement) => requirement.targetPointer);
}
