import type { BindingSchema } from '../types/api-bindings.js';
import type { NativeOutputContract } from '../types/node-output.js';
import { nativeBindingSchemas } from './native-binding-schema.js';
import { validateNativeOutputContracts } from './validate-native-output-contracts.js';
import { isSchemaProvablyEmpty } from './is-schema-provably-empty.js';

/** Project a declared native JSON value without wrapping it in a fictitious OAS response. */
export function createNativeValueSchema(
  output: NativeOutputContract,
  pointer: string,
): BindingSchema {
  validateNativeOutputContracts([output]);
  const schema: BindingSchema = {
    anyOf: nativeBindingSchemas(output, pointer),
  };
  if (isSchemaProvablyEmpty(schema))
    throw new Error(
      `native output ${output.nodeId}${pointer} has no declared value`,
    );
  return schema;
}
