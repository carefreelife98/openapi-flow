import { createHash } from 'node:crypto';
import type { WorkflowDraftApiCallPlanningInput } from '../../../types/workflow-draft-api-call-planning.js';
import type { WorkflowDraftApiBindingIntentDescription } from '../../../types/workflow-draft-api-binding-intent.js';
import { describeWorkflowDraftApiCallPlanning } from './describe-workflow-draft-api-call-planning.js';

/** Intent belongs to the selected request and messages, not changing producer readiness. */
export function describeWorkflowDraftApiBindingIntent(
  input: WorkflowDraftApiCallPlanningInput,
): WorkflowDraftApiBindingIntentDescription {
  const description = describeWorkflowDraftApiCallPlanning(input);
  const fields = {
    instruction: description.instruction,
    operation: description.operation,
    requestSchema: description.requestSchema,
    ...(description.requestMediaType === undefined
      ? {}
      : { requestMediaType: description.requestMediaType }),
    messages: description.messages,
    backgroundMessages: description.backgroundMessages,
    includeExplanations: description.includeExplanations,
    hasRequestInputs: description.hasRequestInputs,
    hasPotentialPredecessors:
      description.hasOtherSelectedNodes ||
      description.sources.values.length > 0,
    sources: { values: [], exclusiveOutputs: [] },
  };
  return {
    ...fields,
    fingerprint: createHash('sha256')
      .update(
        JSON.stringify({
          planId: input.plan.id,
          stepId: input.stepId,
          nodeId: description.nodeId,
          ...fields,
        }),
      )
      .digest('hex'),
  };
}
