import type { WorkflowResponseReference } from '@openapi-flow/core';
import type { NativeCondition } from '../../../types/native-capability.js';
export function responseReferences(
  checks: NativeCondition[],
): WorkflowResponseReference[] {
  return checks
    .flatMap((check) =>
      'right' in check ? [check.left, check.right] : [check.left],
    )
    .filter((operand) => operand.source === 'response');
}
