import type { ApiOperationContract } from '../types/api-operation.js';
import type { BindingSchema } from '../types/api-bindings.js';
import { isObject } from '../utils/is-object.js';
import { schemasAtPointer } from './schema-at-pointer.js';

export function responseBindingSchemas(
  operation: ApiOperationContract,
  pointer: string,
): BindingSchema[] {
  return Object.values(operation.operation.responses ?? {}).flatMap(
    (response) => {
      if (!isObject(response) || !isObject(response.content)) return [];
      return Object.values(response.content).flatMap((media) => {
        if (!isObject(media)) return [];
        const schema = media.schema;
        return typeof schema === 'boolean' || isObject(schema)
          ? schemasAtPointer(schema, pointer)
          : pointer === ''
            ? [true]
            : [];
      });
    },
  );
}
