import type { BindingSchema } from '../types/api-bindings.js';
import type { NativeOutputContract } from '../types/node-output.js';
import { validateNativeOutputContracts } from './validate-native-output-contracts.js';
import { schemasAtPointer } from './schema-at-pointer.js';
import { projectArrayItemSchema } from './project-array-item-schema.js';

/** Native JSON roots are not HTTP envelopes or OAS response definitions. */
export function createNativeArrayItemSchema(
  output: NativeOutputContract,
  pointer: string,
): BindingSchema {
  validateNativeOutputContracts([output]);
  const items = schemasAtPointer(output.schema, pointer).flatMap((schema) => {
    const projection = projectArrayItemSchema(schema);
    return projection.allowsArray ? [projection.schema] : [];
  });
  if (!items.length)
    throw new Error(
      `native output ${output.nodeId}${pointer} has no declared array`,
    );
  return { anyOf: items };
}
