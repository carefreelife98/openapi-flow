import type {
  WorkflowNativeReferenceBinding,
  WorkflowValueReference,
  WorkflowNodeOutputReference,
} from '@openapi-flow/core';
import type { NativeCondition } from '../../../types/native-capability.js';

/** The comparison implementation owns these operand locations. */
export function comparisonValueReferences(
  checks: NativeCondition[],
): WorkflowValueReference[] {
  return checks
    .flatMap((check) =>
      'right' in check ? [check.left, check.right] : [check.left],
    )
    .filter((operand) => operand.source !== 'literal');
}

export function comparisonNodeOutputReferences(
  checks: NativeCondition[],
): WorkflowNodeOutputReference[] {
  return comparisonValueReferences(checks).filter(
    (operand) => operand.source === 'node-output',
  );
}

export function comparisonReferenceBindings(
  checks: NativeCondition[],
  prefix: string,
): WorkflowNativeReferenceBinding[] {
  return checks.flatMap((check, index) =>
    (['left', 'right'] as const).flatMap((side) => {
      const operand =
        side === 'left'
          ? check.left
          : 'right' in check
            ? check.right
            : undefined;
      return operand !== undefined && operand.source !== 'literal'
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
