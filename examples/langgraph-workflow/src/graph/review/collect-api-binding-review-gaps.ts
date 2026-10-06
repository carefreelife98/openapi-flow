import type { WorkflowReviewGap } from '@openapi-flow/core';
import type { CollectApiBindingReviewGapsInput } from '../../types/workflow-review.js';

export function collectApiBindingReviewGaps({
  workflowId,
  materials,
  bindingPlan,
}: CollectApiBindingReviewGapsInput): WorkflowReviewGap[] {
  return bindingPlan.gaps.map((gap, index) => {
    const material = materials.find((item) => item.callId === gap.callId);
    if (!material)
      throw new Error(`binding gap references an unknown call ${gap.callId}`);
    return {
      id: `${workflowId}-binding-gap-${index + 1}`,
      stage: 'api-bindings',
      description: gap.description,
      callId: gap.callId,
      targetPointer: gap.targetPointer,
      operation: material.operation.key,
    };
  });
}
