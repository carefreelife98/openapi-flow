import type { JsonValueObject } from '../types/api-arguments.js';
import type { AssignJsonInputValueInput } from '../types/json-input-assignment.js';
import { cloneJsonValue } from '../utils/clone-json-value.js';
import { pointerTokens } from './json-pointer.js';

/** Schema-owned containers and own-property assignment; never overwrite or fill sparse arrays. */
export function assignJsonInputValue(
  input: AssignJsonInputValueInput,
): JsonValueObject {
  const tokens = pointerTokens(input.pointer);
  if (!tokens.length)
    throw new Error(`${input.source} must identify a JSON field`);
  const result = cloneJsonValue(input.values) as JsonValueObject;
  let container: object = result;
  for (const [index, token] of tokens.entries()) {
    if (
      Array.isArray(container) &&
      (!/^(0|[1-9][0-9]*)$/.test(token) || Number(token) > container.length)
    )
      throw new Error(
        `${input.source} ${input.pointer} requires an explicit complete array prefix`,
      );
    if (index === tokens.length - 1) {
      if (Object.hasOwn(container, token))
        throw new Error(
          `${input.source} conflicts with existing value at ${input.pointer}`,
        );
      Reflect.set(container, token, cloneJsonValue(input.value));
    } else {
      if (!Object.hasOwn(container, token)) {
        const parent =
          '/' +
          tokens
            .slice(0, index + 1)
            .map((part) => part.replaceAll('~', '~0').replaceAll('/', '~1'))
            .join('/');
        Reflect.set(
          container,
          token,
          input.containerKind(parent) === 'array' ? [] : Object.create(null),
        );
      }
      const child: unknown = Reflect.get(container, token);
      if (child === null || typeof child !== 'object')
        throw new Error(
          `${input.source} traverses non-container ${input.pointer}`,
        );
      container = child;
    }
  }
  return JSON.parse(JSON.stringify(result)) as JsonValueObject;
}
