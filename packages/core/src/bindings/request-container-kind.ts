import type {
  ApiBindingMaterial,
  RequestContainerKind,
} from '../types/api-bindings.js';
import { requestSchemaPointer } from './request-schema-pointer.js';
import { schemasAtPointer } from './schema-at-pointer.js';
import { createClosedSchemaPointerResolver } from './resources/create-closed-schema-pointer-resolver.js';
import { schemaAllowsContainer } from './schema-allows-container.js';

/** Container identity comes from the OAS, never from a numeric property name. */
export function requestContainerKind(
  material: ApiBindingMaterial,
  pointer: string,
): RequestContainerKind {
  if (
    ['/path', '/query', '/header', '/cookie', '/querystring'].includes(pointer)
  )
    return 'object';
  const kinds = new Set<string>();
  const selected = requestSchemaPointer(material, pointer);
  const resources =
    selected === undefined
      ? undefined
      : createClosedSchemaPointerResolver(selected.schema);
  const schemas =
    selected === undefined
      ? []
      : schemasAtPointer(selected.schema, selected.pointer, resources);
  for (const schema of schemas) {
    if (schemaAllowsContainer(schema, 'object', resources)) kinds.add('object');
    if (schemaAllowsContainer(schema, 'array', resources)) kinds.add('array');
  }
  if (kinds.size !== 1)
    throw new Error(
      `Request ${material.callId}${pointer} needs an explicit literal container: OAS does not determine object versus array`,
    );
  return kinds.has('array') ? 'array' : 'object';
}
