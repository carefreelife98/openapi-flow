import type { ApiArgumentValues, JsonValue } from '../types/api-arguments.js';
import type { ApiBindingMaterial } from '../types/api-bindings.js';
import { pointerTokens } from './json-pointer.js';
import { requestContainerKind } from './request-container-kind.js';
import { cloneJsonValue } from '../utils/clone-json-value.js';

/** Pure assignment into JSON dictionaries, with OAS-owned container identity. */
export function assignRequestInputValue(
  values: ApiArgumentValues,
  pointer: string,
  value: JsonValue,
  material: ApiBindingMaterial,
): ApiArgumentValues {
  const tokens = pointerTokens(pointer);
  if (
    !tokens.length ||
    !['path', 'query', 'header', 'cookie', 'querystring', 'body'].includes(
      tokens[0],
    )
  )
    throw new Error('confirmed input must identify a request field');
  const result = cloneJsonValue(
    JSON.parse(JSON.stringify(values)),
  ) as ApiArgumentValues;
  let container: object = result;
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
      Reflect.set(container, token, cloneJsonValue(value));
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
          requestContainerKind(material, parent) === 'array'
            ? []
            : Object.create(null),
        );
      }
      const child: unknown = Reflect.get(container, token);
      if (child === null || typeof child !== 'object')
        throw new Error(`confirmed input traverses non-container ${pointer}`);
      container = child;
    }
  }
  return JSON.parse(JSON.stringify(result)) as ApiArgumentValues;
}
