import type { WorkflowNativeReferenceBinding } from '@openapi-flow/core';
import type { NativeCheck } from '../../../types/native-capability.js';

/** The comparison implementation owns these operand locations. */
export function responseReferenceBindings(
  checks: NativeCheck[],
  prefix: string,
): WorkflowNativeReferenceBinding[] {
  return checks.flatMap((check, index) =>
    (['left', 'right'] as const).flatMap((side) => {
      const operand = check[side];
      return operand.source === 'response'
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
