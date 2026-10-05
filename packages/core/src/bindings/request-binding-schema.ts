import type {
  ApiBindingMaterial,
  BindingSchema,
} from '../types/api-bindings.js';
import { pointerTokens } from './json-pointer.js';
import { schemasAtPointer } from './schema-at-pointer.js';
import {
  bodyMediaSchema,
  parameterSchema,
} from '../arguments/request-contract.js';

export function requestBindingSchemas(
  material: ApiBindingMaterial,
  pointer: string,
): BindingSchema[] {
  const [location, name, ...children] = pointerTokens(pointer);
  if (location === 'body') {
    const schema = bodyMediaSchema(
      material.operation,
      material.requestMediaType,
    );
    return schema === undefined
      ? []
      : schemasAtPointer(schema, pointer.slice(5));
  }
  const parameter = material.operation.effective.parameters.find(
    (item) => item.in === location && item.name === name,
  );
  if (!parameter) return [];
  const schema = parameterSchema(parameter, pointer);
  const childPointer = children.length
    ? '/' +
      children
        .map((token) => token.replaceAll('~', '~0').replaceAll('/', '~1'))
        .join('/')
    : '';
  return schemasAtPointer(schema, childPointer);
}
