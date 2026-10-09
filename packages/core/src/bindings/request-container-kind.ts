import type {
  ApiBindingMaterial,
  RequestContainerKind,
} from '../types/api-bindings.js';
import { requestBindingSchemas } from './request-binding-schema.js';
import { schemaAllowsContainer } from './schema-allows-container.js';

/** Container identity comes from the OAS, never from a numeric property name. */
export function requestContainerKind(
  material: ApiBindingMaterial,
  pointer: string,
): RequestContainerKind {
  if (['/path', '/query', '/header', '/cookie'].includes(pointer))
    return 'object';
  const kinds = new Set<string>();
  for (const schema of requestBindingSchemas(material, pointer)) {
    if (schemaAllowsContainer(schema, 'object')) kinds.add('object');
    if (schemaAllowsContainer(schema, 'array')) kinds.add('array');
  }
  if (kinds.size !== 1)
    throw new Error(
      `Request ${material.callId}${pointer} needs an explicit literal container: OAS does not determine object versus array`,
    );
  return kinds.has('array') ? 'array' : 'object';
}
