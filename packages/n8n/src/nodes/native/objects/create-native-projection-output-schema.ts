import {
  createNativeObjectProjectionSchema,
  createNativeValueSchema,
  isSchemaProvablyEmpty,
} from '@openapi-flow/core';
import type { BindingSchema, NativeOutputContract } from '@openapi-flow/core';
import type { NativeOutputProjectionField } from '../../../types/native-output-projection.js';

/** Original field schemas stay unchanged; only explicitly requested measurements are derived integers. */
export function createNativeProjectionOutputSchema(
  source: NativeOutputContract,
  fields: NativeOutputProjectionField[],
): BindingSchema {
  const schema = createNativeObjectProjectionSchema(
    source,
    Object.fromEntries(fields.map((field) => [field.name, field.pointer])),
  );
  if (
    typeof schema === 'boolean' ||
    schema.properties === null ||
    typeof schema.properties !== 'object' ||
    Array.isArray(schema.properties)
  )
    throw new Error(
      'Native projection requires the object properties derived from its source contract',
    );
  for (const field of fields) {
    if (field.measurement === undefined) continue;
    const expected =
      field.measurement === 'utf16-code-units' ? 'string' : 'array';
    if (
      isSchemaProvablyEmpty({
        allOf: [
          createNativeValueSchema(source, field.pointer),
          { type: expected },
        ],
      })
    )
      throw new Error(
        `Native projection ${source.nodeId}${field.pointer} cannot measure ${field.measurement}: its declared type cannot be ${expected}`,
      );
    Reflect.set(schema.properties, field.name, { type: 'integer', minimum: 0 });
  }
  return schema;
}
