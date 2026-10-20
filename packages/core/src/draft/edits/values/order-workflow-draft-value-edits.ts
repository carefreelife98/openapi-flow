import type { WorkflowDraftValueEdit } from '../../../types/workflow-draft-edit-assembly.js';
import { pointerTokens } from '../../../bindings/json-pointer.js';

function comparePointers(left: string, right: string): number {
  const a = pointerTokens(left);
  const b = pointerTokens(right);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] === b[index]) continue;
    if (
      /^(0|[1-9][0-9]*)$/.test(a[index]) &&
      /^(0|[1-9][0-9]*)$/.test(b[index])
    )
      return Number(a[index]) - Number(b[index]);
    return a[index] < b[index] ? -1 : 1;
  }
  return a.length - b.length;
}

/** Targets refer to the original object: set first, then remove descending array indices. */
export function orderWorkflowDraftValueEdits(
  edits: WorkflowDraftValueEdit[],
): WorkflowDraftValueEdit[] {
  return [
    ...edits
      .filter((edit) => edit.kind === 'set')
      .sort((left, right) => comparePointers(left.pointer, right.pointer)),
    ...edits
      .filter((edit) => edit.kind === 'remove')
      .sort((left, right) => comparePointers(right.pointer, left.pointer)),
  ];
}
