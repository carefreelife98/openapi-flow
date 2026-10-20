import type {
  InspectWorkflowDraftCapabilityGapInput,
  WorkflowDraftCapabilityGapDescription,
} from '../../types/workflow-draft-capability-gap.js';
import { inspectWorkflowDraftCapabilityGap } from './inspect-workflow-draft-capability-gap.js';

/** Read-only choice context: models do not generate or need a copy of the full inventory receipt. */
export function describeWorkflowDraftCapabilityGap(
  input: InspectWorkflowDraftCapabilityGapInput,
): WorkflowDraftCapabilityGapDescription {
  return {
    ...inspectWorkflowDraftCapabilityGap(input),
    id: input.gap.id,
    requestedBehavior: input.gap.requestedBehavior,
    finding: structuredClone(input.gap.finding),
  };
}
