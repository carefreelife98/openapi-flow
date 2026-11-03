import type { ApiBindingMaterial } from '../types/api-bindings.js';
import { pointerTokens } from './json-pointer.js';
import type { RequestSchemaPointer } from '../types/schema-resource.js';
import {
  bodyMediaSchema,
  parameterSchema,
} from '../arguments/request-contract.js';

export function requestSchemaPointer(
  material: ApiBindingMaterial,
  pointer: string,
): RequestSchemaPointer | undefined {
  const [location, name, ...children] = pointerTokens(pointer);
  if (location === 'body') {
    const schema = bodyMediaSchema(
      material.operation,
      material.requestMediaType,
    );
    return schema === undefined
      ? undefined
      : { schema, pointer: pointer.slice(5) };
  }
  const parameter = material.operation.effective.parameters.find(
    (item) => item.in === location && item.name === name,
  );
  if (!parameter) return undefined;
  const schema = parameterSchema(parameter, pointer);
  const childPointer = children.length
    ? '/' +
      children
        .map((token) => token.replaceAll('~', '~0').replaceAll('/', '~1'))
        .join('/')
    : '';
  return { schema, pointer: childPointer };
}
