import type { BindingSchema } from '../types/api-bindings.js';
import type { ProjectNativeValueSchemaInput } from '../types/native-schema-projection.js';
import { NativeSchemaProjectionError } from './native-schema-projection-error.js';
import { nativeSchemaProjectionStepsSchema } from '../schemas/native-schema-projection-schema.js';
import { validateNativeOutputContracts } from './validate-native-output-contracts.js';
import { createSchemaResourceContext } from './resources/create-schema-resource-context.js';
import { schemasAtPointer } from './schema-at-pointer.js';
import { projectArrayItemSchema } from './project-array-item-schema.js';
import { projectObjectEntryValueSchema } from './project-object-entry-value-schema.js';
import { isSchemaProvablyEmpty } from './is-schema-provably-empty.js';

/** Keep one original reference context across projections; bundle only the result. */
export function projectNativeValueSchema(
  input: ProjectNativeValueSchemaInput,
): BindingSchema {
  validateNativeOutputContracts([input.output]);
  const steps = nativeSchemaProjectionStepsSchema.parse(input.steps);
  const resources = createSchemaResourceContext(input.output.schema);
  let current: BindingSchema = resources.reference(resources.root);
  for (const step of steps) {
    if (step.kind === 'value') {
      // The empty JSON pointer is the identity projection, not a missing value.
      if (step.pointer !== '') {
        const candidates = schemasAtPointer(current, step.pointer, resources);
        if (!candidates.length)
          throw new Error(
            `native output ${input.output.nodeId}${step.pointer} has no declared value`,
          );
        current = { anyOf: candidates };
      }
    } else if (step.kind === 'object-entries') {
      const values = projectObjectEntryValueSchema(current, resources);
      if (values === false)
        throw new Error(
          `native output ${input.output.nodeId} has no declared object entries`,
        );
      current = { anyOf: [values] };
    } else {
      const projection = projectArrayItemSchema(current, resources);
      if (!projection.allowsArray)
        throw new NativeSchemaProjectionError(input.output.nodeId, step);
      if (step.kind === 'array-items') current = { anyOf: [projection.schema] };
    }
  }
  const result = resources.bundle(current);
  if (isSchemaProvablyEmpty(result))
    throw new Error(
      `native output ${input.output.nodeId} projection has no declared value`,
    );
  return result;
}
