import type { ApiOperationContract } from '../../types/api-operation.js';
import type { BindingSchema } from '../../types/api-bindings.js';
import { responseBindingSchemas } from '../../bindings/response-binding-schema.js';
import { schemasAtPointer } from '../../bindings/schema-at-pointer.js';
import { schemaAllowsContainer } from '../../bindings/schema-allows-container.js';
import { projectObjectEntryValueSchema } from '../../bindings/project-object-entry-value-schema.js';

/** Project one object key without treating numeric keys as array indices. Full responses remain authoritative. */
export function createResponseObjectEntrySchema(
  operation: ApiOperationContract,
  pointer: string,
  key?: string,
): BindingSchema {
  if (key !== undefined && typeof key !== 'string')
    throw new Error('Response object entry.key must be a string');
  const childPointer =
    key === undefined
      ? undefined
      : `/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
  const values = responseBindingSchemas(operation, pointer)
    .filter((schema) => schemaAllowsContainer(schema, 'object'))
    .flatMap((schema) => {
      if (childPointer !== undefined)
        return schemasAtPointer(
          { type: 'object', allOf: [schema] },
          childPointer,
        );
      const value = projectObjectEntryValueSchema(schema);
      return value === false ? [] : [value];
    });
  if (!values.length)
    throw new Error(
      `${operation.key.operationRef}${pointer} has no declared object entry ${JSON.stringify(key)}`,
    );
  return { anyOf: values };
}
