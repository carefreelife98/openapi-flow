import { resolveApiOperations } from '@openapi-flow/core';
import type { WorkflowReviewGap } from '@openapi-flow/core';
import type { WorkflowState } from '../../types/workflow-graph.js';

export async function collectSelectionReviewGaps(
  state: WorkflowState,
): Promise<WorkflowReviewGap[]> {
  if (!state.catalog || !state.selection)
    throw new Error('selection review requires catalog and selection');
  const referenced = state.selection.gaps.flatMap((gap) =>
    gap.operation ? [gap.operation] : [],
  );
  if (referenced.length) await resolveApiOperations(state.catalog, referenced);
  return state.selection.gaps.map((gap, index) => ({
    id: `${state.workflowId}-selection-gap-${index + 1}`,
    stage: 'api-selection',
    description: gap.description,
    ...(gap.operation ? { operation: gap.operation } : {}),
  }));
}
