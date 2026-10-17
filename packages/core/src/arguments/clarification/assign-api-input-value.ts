import type {
  ApiArgumentValues,
  JsonValue,
} from '../../types/api-arguments.js';
import type { ApiBindingMaterial } from '../../types/api-bindings.js';
import { pointerTokens } from '../../bindings/json-pointer.js';
import { requestContainerKind } from '../../bindings/request-container-kind.js';

/** No overwrites, numeric-key guessing, sparse-array filling or value coercion. */
export function assignApiInputValue(
  values: ApiArgumentValues,
  pointer: string,
  value: JsonValue,
  material: ApiBindingMaterial,
): void {
  const tokens = pointerTokens(pointer);
  if (!tokens.length)
    throw new Error('confirmed input must identify a request field');
  let container: object = values;
  for (const [index, token] of tokens.entries()) {
    if (
      Array.isArray(container) &&
      (!/^(0|[1-9][0-9]*)$/.test(token) || Number(token) > container.length)
    )
      throw new Error(
        `confirmed input ${pointer} requires an explicit complete array prefix`,
      );
    if (index === tokens.length - 1) {
      if (Object.hasOwn(container, token))
        throw new Error(
          `Request value conflicts with confirmed input ${pointer}`,
        );
      Object.defineProperty(container, token, {
        value: structuredClone(value),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    } else {
      if (!Object.hasOwn(container, token)) {
        const parent =
          '/' +
          tokens
            .slice(0, index + 1)
            .map((part) => part.replaceAll('~', '~0').replaceAll('/', '~1'))
            .join('/');
        Object.defineProperty(container, token, {
          value: requestContainerKind(material, parent) === 'array' ? [] : {},
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      const child: unknown = Reflect.get(container, token);
      if (child === null || typeof child !== 'object')
        throw new Error(`confirmed input traverses non-container ${pointer}`);
      container = child;
    }
  }
}
