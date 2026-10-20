import type {
  AssembleWorkflowDraftEditInput,
  AssembledWorkflowDraftEdit,
} from '../../types/workflow-draft-edit-assembly.js';
import { workflowDraftEditConnectionChangeSchema } from '../../schemas/workflow-draft-edit-assembly-schema.js';
import { resolvePreparedWorkflowDraftEdit } from './assembly/resolve-prepared-workflow-draft-edit.js';
import { applyDraftChangeSet } from '../changes/apply-draft-change-set.js';
import { WorkflowDraftEditAssemblyError } from './workflow-draft-edit-assembly-error.js';
import { createWorkflowDraftEditCandidateContext } from '../requirements/create-workflow-draft-edit-candidate-context.js';
import { validateWorkflowDraftNativeDependencyResolutions } from './native/additions/resolve-workflow-draft-native-dependencies.js';

/** Return one validated candidate revision; only the host decides whether to adopt it. */
export function assembleWorkflowDraftEdit(
  input: AssembleWorkflowDraftEditInput,
): AssembledWorkflowDraftEdit {
  if (input.producerDependencies !== undefined)
    validateWorkflowDraftNativeDependencyResolutions({
      ...input,
      producerDependencies: input.producerDependencies,
    });
  const prepared = resolvePreparedWorkflowDraftEdit(input, 'complete');
  if (prepared.pendingClarificationQuestionIds.length)
    throw new Error(
      `Draft edit requires explicit clarification replies before final adoption: ${prepared.pendingClarificationQuestionIds.join(', ')}`,
    );
  if (prepared.pendingRepairs.length)
    throw new WorkflowDraftEditAssemblyError(
      { stage: 'dependency-repairs', pendingRepairs: prepared.pendingRepairs },
      new Error(
        `Draft edit requires explicit dependency repairs: ${prepared.pendingRepairs.map((task) => `${task.id} (${task.nodeId})`).join(', ')}`,
      ),
    );
  const connections = workflowDraftEditConnectionChangeSchema
    .array()
    .optional()
    .parse(input.connections);
  const changes = [...prepared.changes];
  for (const connection of connections === undefined ? [] : connections) {
    if (
      connection.stepIds.some(
        (id) =>
          !input.plan.steps.some(
            (step) => step.id === id && step.stages.includes('connections'),
          ),
      )
    )
      throw new Error(
        'Draft connection change requires known connection-planning stepIds',
      );
    changes.push({ kind: connection.kind, edge: connection.edge });
  }
  if (input.plan.status === 'no-change') {
    if (changes.length)
      throw new Error('A no-change edit cannot modify draft content');
    return { status: 'no-change', draft: structuredClone(input.draft) };
  }
  if (changes.length === 0)
    return { status: 'no-change', draft: structuredClone(input.draft) };
  const changeSet = { baseRevision: input.plan.baseRevision, changes };
  try {
    const result = applyDraftChangeSet({
      draft: input.draft,
      context: createWorkflowDraftEditCandidateContext(input),
      changeSet,
    });
    return {
      status: 'changed',
      ...result,
      changeSet,
      deferredRequirementIds: prepared.deferredRequirementIds,
    };
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftEditAssemblyError(
      { stage: 'final-validation', changeSet },
      cause,
    );
  }
}
