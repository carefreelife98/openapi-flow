import type { ResolveWorkflowDraftClarificationOwnerIndexInput } from '../../../types/workflow-draft-clarification-ownership.js';
import { workflowDraftClarificationStages } from './workflow-draft-clarification-stages.js';

/** Owner references address explicit decisions, never inferred text, material names or guessed IDs. */
export function resolveWorkflowDraftClarificationOwnerIndex(
  input: ResolveWorkflowDraftClarificationOwnerIndexInput,
): number | undefined {
  const source = input.decisions[input.sourceIndex];
  if (!source || source.kind !== 'needs-clarification')
    throw new Error(
      `Clarification source ${input.sourceIndex} must name a needs-clarification decision`,
    );
  if (source.owner.kind === 'semantic') return undefined;
  const index = source.owner.decisionIndex;
  const target = input.decisions[index];
  if (!Number.isSafeInteger(index) || index < 0 || !target)
    throw new Error(
      `Clarification owner decisionIndex ${index} must name an existing decision`,
    );
  if (
    index === input.sourceIndex ||
    target.kind === 'needs-clarification' ||
    target.kind === 'no-change' ||
    target.kind === 'remove-requirement'
  )
    throw new Error(
      `Clarification owner decisionIndex ${index} must name an actual value, requirement or connection planning decision`,
    );
  if (!workflowDraftClarificationStages(target).includes(source.owner.stage))
    throw new Error(
      `Clarification owner decisionIndex ${index} has no ${source.owner.stage} planning stage`,
    );
  return index;
}
