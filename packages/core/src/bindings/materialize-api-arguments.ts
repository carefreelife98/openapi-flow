import type {
  ApiArgumentValues,
  JsonValue,
  OutputBinding,
} from '../types/api-arguments.js';
import { pointerTokens, pointerValue } from './json-pointer.js';
import type { ApiBindingMaterial } from '../types/api-bindings.js';
import { requestContainerKind } from './request-container-kind.js';

/** Copy response values without coercion, defaults or missing-value recovery. */
export function materializeApiArguments(
  values: ApiArgumentValues,
  bindings: OutputBinding[],
  responses: Record<string, JsonValue>,
  material: ApiBindingMaterial,
): ApiArgumentValues {
  function copy(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value.map(copy);
    if (value === null || typeof value !== 'object') return value;
    const result: Record<string, JsonValue> = Object.create(null);
    for (const [key, child] of Object.entries(value)) result[key] = copy(child);
    return result;
  }
  const result = copy(JSON.parse(JSON.stringify(values))) as ApiArgumentValues;
  for (const binding of bindings) {
    if (!Object.hasOwn(responses, binding.sourceNodeId))
      throw new Error(`Missing response node ${binding.sourceNodeId}`);
    const value = pointerValue(
      responses[binding.sourceNodeId],
      binding.sourcePointer,
    );
    if (value === undefined)
      throw new Error(
        `Missing response pointer ${binding.sourceNodeId}${binding.sourcePointer}`,
      );
    const tokens = pointerTokens(binding.targetPointer);
    if (!tokens.length)
      throw new Error('binding target must identify a request field');
    let container: object = result;
    for (const [index, token] of tokens.entries()) {
      if (index === tokens.length - 1) {
        if (Object.hasOwn(container, token))
          throw new Error(
            `Literal conflicts with binding ${binding.targetPointer}`,
          );
        if (Array.isArray(container) && !/^(0|[1-9][0-9]*)$/.test(token))
          throw new Error(
            `Binding array index is invalid ${binding.targetPointer}`,
          );
        Reflect.set(container, token, copy(value as JsonValue));
      } else {
        if (!Object.hasOwn(container, token)) {
          const pointer =
            '/' +
            tokens
              .slice(0, index + 1)
              .map((part) => part.replaceAll('~', '~0').replaceAll('/', '~1'))
              .join('/');
          const next: object =
            requestContainerKind(material, pointer) === 'array'
              ? []
              : Object.create(null);
          Reflect.set(container, token, next);
        }
        const child = Reflect.get(container, token);
        if (!child || typeof child !== 'object')
          throw new Error(
            `Binding traverses non-container ${binding.targetPointer}`,
          );
        container = child;
      }
    }
  }
  return JSON.parse(JSON.stringify(result)) as ApiArgumentValues;
}
