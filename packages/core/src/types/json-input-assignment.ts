import type { JsonValue, JsonValueObject } from './api-arguments.js';
import type { RequestContainerKind } from './api-bindings.js';

export interface AssignJsonInputValueInput {
  values: JsonValueObject;
  pointer: string;
  value: JsonValue;
  containerKind: (pointer: string) => RequestContainerKind;
  source: string;
}
