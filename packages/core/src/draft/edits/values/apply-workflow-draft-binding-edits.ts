import type { OutputBinding } from '../../../types/api-arguments.js';
import type { WorkflowDraftBindingEdit } from '../../../types/workflow-draft-edit-assembly.js';

export function applyWorkflowDraftBindingEdits(
  bindings: OutputBinding[],
  edits: WorkflowDraftBindingEdit[],
  source: string,
): OutputBinding[] {
  const result = structuredClone(bindings);
  for (const edit of edits) {
    const target =
      edit.kind === 'set' ? edit.binding.targetPointer : edit.targetPointer;
    const index = result.findIndex(
      (binding) => binding.targetPointer === target,
    );
    if (edit.kind === 'remove') {
      if (index < 0)
        throw new Error(`${source}: cannot remove absent binding ${target}`);
      result.splice(index, 1);
    } else if (index < 0) result.push(structuredClone(edit.binding));
    else result[index] = structuredClone(edit.binding);
  }
  return result;
}
