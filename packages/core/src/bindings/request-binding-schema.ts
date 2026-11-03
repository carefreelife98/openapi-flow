import type {
  ApiBindingMaterial,
  BindingSchema,
} from '../types/api-bindings.js';
import { requestSchemaPointer } from './request-schema-pointer.js';
import { projectSchemaPointer } from './project-schema-pointer.js';

export function requestBindingSchemas(
  material: ApiBindingMaterial,
  pointer: string,
): BindingSchema[] {
  const selected = requestSchemaPointer(material, pointer);
  return selected === undefined
    ? []
    : projectSchemaPointer(selected.schema, selected.pointer);
}
