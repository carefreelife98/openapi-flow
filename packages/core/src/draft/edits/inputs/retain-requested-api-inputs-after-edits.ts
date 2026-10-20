import type { WorkflowDraftValueEdit } from '../../../types/workflow-draft-edit-assembly.js';

/** An explicit removal withdraws only that input intent and its descendants. */
export function retainRequestedApiInputsAfterEdits(
  requestedInputs: string[],
  edits: WorkflowDraftValueEdit[],
): string[] {
  return requestedInputs.filter(
    (pointer) =>
      !edits.some(
        (edit) =>
          edit.kind === 'remove' &&
          (edit.pointer === '' ||
            pointer === edit.pointer ||
            pointer.startsWith(edit.pointer + '/')),
      ),
  );
}
