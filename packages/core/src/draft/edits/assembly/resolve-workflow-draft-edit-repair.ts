import type {
  WorkflowDraftEditRepair,
  WorkflowDraftEditRepairTask,
} from '../../../types/workflow-draft-edit-assembly.js';
import type { WorkflowDraftContent } from '../../../types/workflow-draft.js';
import type { WorkflowDraftChange } from '../../../types/workflow-draft-changes.js';
import { workflowDraftNativeNodeSchema } from '../../../schemas/workflow-draft-schema.js';
import { applyWorkflowDraftBindingEdits } from '../values/apply-workflow-draft-binding-edits.js';
import { applyWorkflowDraftValueEdits } from '../values/apply-workflow-draft-value-edits.js';

export function resolveWorkflowDraftEditRepair(
  content: WorkflowDraftContent,
  task: WorkflowDraftEditRepairTask,
  repair: WorkflowDraftEditRepair,
): WorkflowDraftChange {
  if (task.kind !== repair.kind)
    throw new Error(
      `Draft repair ${task.id} must resolve ${task.kind}, not ${repair.kind}`,
    );
  if (repair.kind === 'api-bindings') {
    for (const edit of repair.edits) {
      const pointer =
        edit.kind === 'set' ? edit.binding.targetPointer : edit.targetPointer;
      if (!task.targetPointers.includes(pointer))
        throw new Error(
          `Draft repair ${task.id} cannot alter unrelated API binding target ${pointer}`,
        );
    }
    const call = content.apiCalls.find((call) => call.id === task.nodeId)!;
    return {
      kind: 'update-api-call',
      call: {
        ...call,
        bindings: applyWorkflowDraftBindingEdits(
          call.bindings,
          repair.edits,
          `Draft repair ${task.nodeId}`,
        ),
      },
    };
  }
  const node = content.nativeNodes.find((node) => node.id === task.nodeId)!;
  if (
    task.targetPointers.length &&
    repair.edits.some((edit) => !task.targetPointers.includes(edit.pointer))
  )
    throw new Error(
      `Draft repair ${task.id} cannot alter unrelated native parameter locations`,
    );
  return {
    kind: 'update-native-node',
    node: workflowDraftNativeNodeSchema.parse({
      ...node,
      parameters: applyWorkflowDraftValueEdits({
        value: node.parameters,
        edits: repair.edits,
        source: `Draft repair ${task.nodeId}`,
      }),
    }),
  };
}
