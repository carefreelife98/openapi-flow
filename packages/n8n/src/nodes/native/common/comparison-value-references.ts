import type {
  WorkflowNativeReferenceBinding,
  WorkflowValueReference,
  WorkflowNodeOutputReference,
} from '@openapi-flow/core';
import type { NativeCheck } from '../../../types/native-capability.js';

/** The comparison implementation owns these operand locations. */
export function comparisonValueReferences(
  checks: NativeCheck[],
): WorkflowValueReference[] {
  return checks
    .flatMap((check) => [check.left, check.right])
    .filter((operand) => operand.source !== 'literal');
}

export function comparisonNodeOutputReferences(
  checks: NativeCheck[],
): WorkflowNodeOutputReference[] {
  return comparisonValueReferences(checks).filter(
    (operand) => operand.source === 'node-output',
  );
}

export function comparisonReferenceBindings(
  checks: NativeCheck[],
  prefix: string,
): WorkflowNativeReferenceBinding[] {
  return checks.flatMap((check, index) =>
    (['left', 'right'] as const).flatMap((side) => {
      const operand = check[side];
      return operand.source !== 'literal'
        ? [
            {
              nodeIdPointer: `${prefix}/${index}/${side}/nodeId`,
              valuePointer: `${prefix}/${index}/${side}/pointer`,
              reference: { ...operand },
            },
          ]
        : [];
    }),
  );
}
