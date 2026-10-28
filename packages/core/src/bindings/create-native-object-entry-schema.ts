import type { BindingSchema } from '../types/api-bindings.js';
import type { NativeOutputContract } from '../types/node-output.js';
import { validateNativeOutputContracts } from './validate-native-output-contracts.js';
import { createSchemaResourceContext } from './resources/create-schema-resource-context.js';
import { schemasAtPointer } from './schema-at-pointer.js';
import { projectObjectEntryValueSchema } from './project-object-entry-value-schema.js';

/** Value domain of actual object entries; original containers remain authoritative. */
export function createNativeObjectEntrySchema(
  output: NativeOutputContract,
  pointer: string,
): BindingSchema {
  validateNativeOutputContracts([output]);
  const resources = createSchemaResourceContext(output.schema);
  const values = schemasAtPointer(resources.root, pointer, resources)
    .map((schema) => projectObjectEntryValueSchema(schema, resources))
    .filter((schema) => schema !== false);
  if (!values.length)
    throw new Error(
      `native output ${output.nodeId}${pointer} has no declared object entries`,
    );
  return resources.bundle({ anyOf: values });
}
