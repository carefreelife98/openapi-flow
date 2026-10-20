import type { JsonValue } from '../../../types/api-arguments.js';
import type { ApplyWorkflowDraftValueEditsInput } from '../../../types/workflow-draft-edit-assembly-internal.js';
import { pointerTokens } from '../../../bindings/json-pointer.js';
import { cloneJsonValue } from '../../../utils/clone-json-value.js';

/** Explicit set/remove semantics. No missing parent, sparse array or value is guessed. */
export function applyWorkflowDraftValueEdits(
  input: ApplyWorkflowDraftValueEditsInput,
): JsonValue {
  let result = cloneJsonValue(input.value);
  for (const edit of input.edits) {
    const tokens = pointerTokens(edit.pointer);
    if (!tokens.length) {
      if (edit.kind === 'remove')
        throw new Error(`${input.source}: cannot remove the parameter root`);
      result = cloneJsonValue(edit.value);
      continue;
    }
    let parent: JsonValue = result;
    for (const token of tokens.slice(0, -1)) {
      if (
        parent === null ||
        typeof parent !== 'object' ||
        !Object.hasOwn(parent, token)
      )
        throw new Error(
          `${input.source}${edit.pointer}: missing explicit parent container`,
        );
      parent = Reflect.get(parent, token);
    }
    if (parent === null || typeof parent !== 'object')
      throw new Error(
        `${input.source}${edit.pointer}: parent is not a container`,
      );
    const name = tokens.at(-1)!;
    if (Array.isArray(parent)) {
      if (!/^(0|[1-9][0-9]*)$/.test(name) || Number(name) > parent.length)
        throw new Error(
          `${input.source}${edit.pointer}: invalid or sparse array index`,
        );
      if (edit.kind === 'remove') {
        if (Number(name) === parent.length)
          throw new Error(
            `${input.source}${edit.pointer}: cannot remove an absent value`,
          );
        parent.splice(Number(name), 1);
      } else parent[Number(name)] = cloneJsonValue(edit.value);
    } else if (edit.kind === 'remove') {
      if (!Object.hasOwn(parent, name))
        throw new Error(
          `${input.source}${edit.pointer}: cannot remove an absent value`,
        );
      Reflect.deleteProperty(parent, name);
    } else Reflect.set(parent, name, cloneJsonValue(edit.value));
  }
  return result;
}
