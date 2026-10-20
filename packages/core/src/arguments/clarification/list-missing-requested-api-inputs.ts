import type { RequestedApiInputPresenceInput } from '../../types/requested-api-inputs.js';
import { hasPointer, pointerTokens } from '../../bindings/json-pointer.js';

/** Shared by typed answers, runtime input values and the final materialized request. */
export function listMissingRequestedApiInputs(
  input: RequestedApiInputPresenceInput,
): string[] {
  pointerTokens(input.rootPointer);
  if (input.requestedInputs === undefined) return [];
  if (!Array.isArray(input.requestedInputs))
    throw new Error(`${input.source}.requestedInputs must be an array`);
  const seen = new Set<string>();
  return input.requestedInputs.filter((pointer) => {
    if (
      typeof pointer !== 'string' ||
      !pointerTokens(pointer).length ||
      seen.has(pointer)
    )
      throw new Error(
        `${input.source}.requestedInputs must contain distinct non-root JSON Pointers`,
      );
    seen.add(pointer);
    if (
      pointer !== input.rootPointer &&
      !pointer.startsWith(input.rootPointer + '/')
    )
      throw new Error(
        `${input.source}.requestedInputs contains ${pointer} outside ${input.rootPointer}`,
      );
    return !hasPointer(input.value, pointer.slice(input.rootPointer.length));
  });
}
