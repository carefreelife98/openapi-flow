import type { BindingSchema } from '../types/api-bindings.js';
import type { NativeOutputContract } from '../types/node-output.js';
import { createSchemaResourceContext } from './resources/create-schema-resource-context.js';
import { schemasAtPointer } from './schema-at-pointer.js';

export function nativeBindingSchemas(
  output: NativeOutputContract,
  pointer: string,
): BindingSchema[] {
  const resources = createSchemaResourceContext(output.schema);
  return schemasAtPointer(resources.root, pointer, resources).map(
    resources.bundle,
  );
}
