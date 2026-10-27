import type { BindingSchema } from '../types/api-bindings.js';
import type {
  ApiResponsePointerBoundaryKind,
  ApiResponsePointerCatalog,
  ApiResponsePointerType,
} from '../types/api-response-pointers.js';
import { isObject } from '../utils/is-object.js';

function pointerToken(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** Visit schema-valued declarations only; never invent a dictionary key or item index. */
export function listDeclaredSchemaPointers(
  schema: BindingSchema,
  catalog: Pick<
    ApiResponsePointerCatalog,
    'declaredPointers' | 'dynamicLocations'
  >,
): void {
  const active = new Set<BindingSchema>();
  function visit(
    current: BindingSchema,
    pointer: string,
    location: string,
  ): void {
    if (current === false) return;
    function boundary(
      kind: ApiResponsePointerBoundaryKind,
      suffix = '',
      constraint?: string,
    ): void {
      catalog.dynamicLocations.push({
        pointer,
        schemaLocation: location + suffix,
        kind,
        ...(constraint === undefined ? {} : { constraint }),
      });
    }
    if (active.has(current)) {
      boundary('recursive-schema');
      return;
    }
    catalog.declaredPointers.push({
      pointer,
      schemaLocation: location,
      ...(typeof current !== 'boolean' &&
      (typeof current.type === 'string' ||
        (Array.isArray(current.type) &&
          current.type.every((value) => typeof value === 'string')))
        ? { type: structuredClone(current.type) as ApiResponsePointerType }
        : {}),
      ...(typeof current !== 'boolean' &&
      typeof current.description === 'string'
        ? { description: current.description }
        : {}),
    });
    if (current === true) {
      boundary('unconstrained');
      return;
    }
    active.add(current);
    try {
      for (const keyword of ['$ref', '$dynamicRef'])
        if (typeof current[keyword] === 'string')
          boundary('reference', '/' + keyword, current[keyword]);
      if (isObject(current.properties))
        for (const [name, child] of Object.entries(current.properties))
          if (typeof child === 'boolean' || isObject(child))
            visit(
              child,
              pointer + '/' + pointerToken(name),
              location + '/properties/' + pointerToken(name),
            );
      const types = Array.isArray(current.type) ? current.type : [current.type];
      if (
        (current.type === undefined || types.includes('object')) &&
        current.additionalProperties !== false
      )
        boundary(
          'additional-properties',
          current.additionalProperties === undefined
            ? ''
            : '/additionalProperties',
        );
      if (isObject(current.patternProperties))
        for (const [pattern, child] of Object.entries(
          current.patternProperties,
        ))
          if (child !== false)
            boundary(
              'pattern-properties',
              '/patternProperties/' + pointerToken(pattern),
              pattern,
            );
      if (Array.isArray(current.prefixItems))
        current.prefixItems.forEach((child, index) => {
          if (typeof child === 'boolean' || isObject(child))
            visit(
              child,
              pointer + '/' + index,
              location + '/prefixItems/' + index,
            );
        });
      if (
        (current.type === undefined || types.includes('array')) &&
        current.items !== false
      )
        boundary('array-items', current.items === undefined ? '' : '/items');
      for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
        const branches = current[keyword];
        if (Array.isArray(branches))
          branches.forEach((child, index) => {
            if (typeof child === 'boolean' || isObject(child))
              visit(child, pointer, location + '/' + keyword + '/' + index);
          });
      }
      for (const keyword of ['then', 'else']) {
        const child = current[keyword];
        if (typeof child === 'boolean' || isObject(child))
          visit(child, pointer, location + '/' + keyword);
      }
      if (isObject(current.dependentSchemas))
        for (const [name, child] of Object.entries(current.dependentSchemas))
          if (typeof child === 'boolean' || isObject(child))
            visit(
              child,
              pointer,
              location + '/dependentSchemas/' + pointerToken(name),
            );
    } finally {
      active.delete(current);
    }
  }
  visit(schema, '', '');
}
