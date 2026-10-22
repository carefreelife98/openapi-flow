import type { ResolveWorkflowDraftApiCallArgumentsInput } from '../../../types/workflow-draft-api-call-planning.js';
import type { VerifiedWorkflowDraftApiEnumSelection } from '../../../types/workflow-draft-api-enum-selection.js';
import type { WorkflowDraftApiEnumResolution } from '../../../types/workflow-draft-api-enum-selection.js';
import { describeWorkflowDraftApiEnumChoices } from './describe-workflow-draft-api-enum-choices.js';
import { createWorkflowDraftApiEnumSelectionSchema } from '../../../schemas/workflow-draft-api-enum-selection-schema.js';
import { assignApiInputValue } from '../../../arguments/clarification/assign-api-input-value.js';
import { resolveApiCallArgumentsContext } from './resolve-api-call-arguments-context.js';
import { verifyWorkflowDraftApiEnumSelection } from '../enum/verify-workflow-draft-api-enum-selection.js';

/** Copy from the current OAS, never from model-supplied values or same-name fields. */
export function resolveWorkflowDraftApiEnumSelections(
  input: ResolveWorkflowDraftApiCallArgumentsInput,
): WorkflowDraftApiEnumResolution {
  const values = structuredClone(input.proposal.values);
  const verified: VerifiedWorkflowDraftApiEnumSelection[] = [];
  if (input.enumSelections === undefined)
    return { values, selections: verified };
  const { candidates } = describeWorkflowDraftApiEnumChoices(input);
  const proposal = createWorkflowDraftApiEnumSelectionSchema(input).parse({
    selections: input.enumSelections,
  });
  const { description } = resolveApiCallArgumentsContext(input);
  for (const selection of proposal.selections) {
    const candidate = candidates.find(
      (item) => item.id === selection.candidateId,
    );
    if (!candidate)
      throw new Error(
        `API enum selection ${selection.candidateId} is absent from the current OAS choices`,
      );
    if (
      verified.some(
        (item) =>
          item.targetPointer === candidate.targetPointer ||
          item.targetPointer.startsWith(candidate.targetPointer + '/') ||
          candidate.targetPointer.startsWith(item.targetPointer + '/'),
      )
    )
      throw new Error(
        `API enum selections overlap at ${candidate.targetPointer}`,
      );
    const receipt = verifyWorkflowDraftApiEnumSelection({
      selection,
      candidates,
      messages: [...description.messages, ...description.backgroundMessages],
    });
    assignApiInputValue(
      values,
      candidate.targetPointer,
      structuredClone(candidate.value),
      {
        operation: description.operation,
        requestMediaType: description.requestMediaType,
        callId: description.nodeId,
      },
    );
    verified.push(receipt);
  }
  return { values, selections: verified };
}
