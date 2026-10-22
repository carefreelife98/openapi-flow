import type {
  VerifyWorkflowDraftApiEnumSelectionInput,
  VerifiedWorkflowDraftApiEnumSelection,
} from '../../../types/workflow-draft-api-enum-selection.js';
import { createWorkflowDraftApiEnumChoiceSchema } from '../../../schemas/workflow-draft-api-enum-choice-schema.js';
import { readApiInputLiteralSource } from '../../../arguments/sources/read-api-input-literal-source.js';

/** Human intent is a separate receipt; the selected request value comes only from the OAS. */
export function verifyWorkflowDraftApiEnumSelection(
  input: VerifyWorkflowDraftApiEnumSelectionInput,
): VerifiedWorkflowDraftApiEnumSelection {
  const selection = createWorkflowDraftApiEnumChoiceSchema(
    input.candidates,
    input.messages.map((message) => message.id),
  ).parse(input.selection);
  const candidate = input.candidates.find(
    (item) => item.id === selection.candidateId,
  );
  if (!candidate)
    throw new Error(
      `API enum selection ${selection.candidateId} is absent from the current OAS choices`,
    );
  const message = input.messages.find(
    (item) => item.id === selection.messageId,
  );
  if (!message)
    throw new Error(
      `API enum selection cites unavailable message ${selection.messageId}`,
    );
  const source = readApiInputLiteralSource({
    sourceFormat: 'text',
    sourceText: selection.sourceText,
    text: message.text,
    label: `API enum ${candidate.targetPointer}`,
  });
  return {
    ...structuredClone(candidate),
    ...selection,
    occurrences: source.occurrences,
  };
}
