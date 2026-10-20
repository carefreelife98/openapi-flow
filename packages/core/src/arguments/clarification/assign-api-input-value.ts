import type {
  ApiArgumentValues,
  JsonValue,
} from '../../types/api-arguments.js';
import type { ApiBindingMaterial } from '../../types/api-bindings.js';
import { pointerTokens } from '../../bindings/json-pointer.js';
import { assignRequestInputValue } from '../../bindings/assign-request-input-value.js';

/** No overwrites, numeric-key guessing, sparse-array filling or value coercion. */
export function assignApiInputValue(
  values: ApiArgumentValues,
  pointer: string,
  value: JsonValue,
  material: ApiBindingMaterial,
): void {
  const assigned = assignRequestInputValue(values, pointer, value, material);
  const group = pointerTokens(pointer)[0];
  Reflect.set(values, group, Reflect.get(assigned, group));
}
