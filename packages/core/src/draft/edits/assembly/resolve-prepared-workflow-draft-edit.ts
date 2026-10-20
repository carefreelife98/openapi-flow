import type { PrepareWorkflowDraftEditInput } from '../../../types/workflow-draft-edit-assembly.js';
import type {
  PrimaryWorkflowDraftEdit,
  WorkflowDraftEditPreparationMode,
} from '../../../types/workflow-draft-edit-assembly-internal.js';
import { workflowDraftEditRepairSchema } from '../../../schemas/workflow-draft-edit-assembly-schema.js';
import { applyDraftChange } from '../../changes/apply-draft-change.js';
import { preparePrimaryWorkflowDraftEdit } from './prepare-primary-workflow-draft-edit.js';
import { inspectWorkflowDraftEditRepairs } from './inspect-workflow-draft-edit-repairs.js';
import { resolveWorkflowDraftEditRepair } from './resolve-workflow-draft-edit-repair.js';

/** Recompute repair authority after each explicit result; never trust client-edited material state. */
export function resolvePreparedWorkflowDraftEdit(
  input: PrepareWorkflowDraftEditInput,
  mode: WorkflowDraftEditPreparationMode,
): PrimaryWorkflowDraftEdit {
  const prepared = preparePrimaryWorkflowDraftEdit(input, mode);
  const repairs = workflowDraftEditRepairSchema
    .array()
    .optional()
    .parse(input.repairs);
  const pending = [...(repairs === undefined ? [] : repairs)];
  if (new Set(pending.map((repair) => repair.taskId)).size !== pending.length)
    throw new Error('Draft edit repairs require distinct taskId values');
  const acknowledgedTaskIds = new Set<string>();
  const inspect = () =>
    inspectWorkflowDraftEditRepairs({
      before: input.draft,
      content: prepared.content,
      context: input.context,
      plan: input.plan,
      acknowledgedTaskIds,
      pendingResolutionStepIds: prepared.pendingResolutionStepIds,
    });
  while (pending.length) {
    const tasks = inspect();
    const index = pending.findIndex((repair) =>
      tasks.some((task) => task.id === repair.taskId),
    );
    if (index < 0)
      throw new Error(
        `Draft edit repair task is unknown or stale: ${pending.map((repair) => repair.taskId).join(', ')}`,
      );
    const [repair] = pending.splice(index, 1);
    const task = tasks.find((task) => task.id === repair.taskId)!;
    const change = resolveWorkflowDraftEditRepair(
      prepared.content,
      task,
      repair,
    );
    applyDraftChange(prepared.content, change);
    prepared.changes.push(change);
    acknowledgedTaskIds.add(task.id);
  }
  return { ...prepared, pendingRepairs: inspect() };
}
