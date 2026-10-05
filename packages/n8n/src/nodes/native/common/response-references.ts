import type { WorkflowResponseReference } from '@openapi-flow/core';
import type { NativeCheck } from '../../../types/native-capability.js';
export function responseReferences(
  checks: NativeCheck[],
): WorkflowResponseReference[] {
  return checks
    .flatMap((check) => [check.left, check.right])
    .filter((operand) => operand.source === 'response');
}
