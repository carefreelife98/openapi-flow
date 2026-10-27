import type { BindingSchema } from '../types/api-bindings.js';
import type { NativeOutputContract } from '../types/node-output.js';
import { createSchemaResourceContext } from './resources/create-schema-resource-context.js';
import { schemasAtPointer } from './schema-at-pointer.js';
import { validateNativeOutputContracts } from './validate-native-output-contracts.js';
import { isSchemaProvablyEmpty } from './is-schema-provably-empty.js';
import { isObject } from '../utils/is-object.js';

/** Share one unchanged native schema resource across every selected object field. */
export function createNativeObjectProjectionSchema(
  output: NativeOutputContract,
  fieldPointers: Record<string, string>,
): BindingSchema {
  validateNativeOutputContracts([output]);
  if (!isObject(fieldPointers))
    throw new Error('native object projection.fieldPointers must be an object');
  const resources = createSchemaResourceContext(output.schema);
  const properties = Object.fromEntries(
    Object.entries(fieldPointers).map(([name, pointer]) => {
      if (typeof pointer !== 'string')
        throw new Error(
          `native object projection.fieldPointers[${JSON.stringify(name)}] must be a JSON Pointer string`,
        );
      const schema: BindingSchema = {
        anyOf: schemasAtPointer(resources.root, pointer, resources),
      };
      if (isSchemaProvablyEmpty(schema))
        throw new Error(
          `native output ${output.nodeId}${pointer} has no declared value`,
        );
      return [name, schema];
    }),
  );
  return resources.bundle({
    type: 'object',
    properties,
    required: Object.keys(fieldPointers),
    additionalProperties: false,
  });
}
