import type {
  ResolveWorkflowDraftApiInputEditsInput,
  WorkflowDraftApiInputEditResult,
  WorkflowDraftApiInputEditTarget,
} from '../../../types/workflow-draft-api-input-edit.js';
import type { WorkflowDraftValueEdit } from '../../../types/workflow-draft-edit-assembly.js';
import { createWorkflowDraftApiInputEditValuesSchema } from '../../../schemas/create-workflow-draft-api-input-edit-values-schema.js';
import { createWorkflowDraftApiInputEditAnswersSchema } from '../../../schemas/create-workflow-draft-api-input-edit-answers-schema.js';
import { describeWorkflowDraftApiInputEdit } from './describe-workflow-draft-api-input-edit.js';
import { validateWorkflowPlanningEvidence } from '../../../planning/evidence/validate-workflow-planning-evidence.js';
import { applyWorkflowDraftApiInputEdits } from '../values/apply-workflow-draft-api-input-edits.js';
import { validateApiArguments } from '../../../arguments/validate-api-arguments.js';
import { orderWorkflowDraftValueEdits } from '../values/order-workflow-draft-value-edits.js';
import { verifyApiInputLiteralSource } from '../../../arguments/sources/verify-api-input-literal-source.js';
import { describeWorkflowDraftApiInputEditEnumChoices } from './describe-workflow-draft-api-input-edit-enum-choices.js';
import { verifyWorkflowDraftApiEnumSelection } from '../enum/verify-workflow-draft-api-enum-selection.js';
import type { VerifiedWorkflowDraftApiEnumSelection } from '../../../types/workflow-draft-api-enum-selection.js';

/** Exact-source validation is deterministic; it is not semantic entailment proof. */
export function resolveWorkflowDraftApiInputEdits(
  input: ResolveWorkflowDraftApiInputEditsInput,
): WorkflowDraftApiInputEditResult {
  const output = createWorkflowDraftApiInputEditValuesSchema(input).parse(
    input.output,
  );
  const described = describeWorkflowDraftApiInputEdit(input);
  const confirmedAnswers =
    input.confirmedAnswers === undefined
      ? undefined
      : structuredClone(
          createWorkflowDraftApiInputEditAnswersSchema(input).parse(
            input.confirmedAnswers,
          ),
        );
  const human =
    confirmedAnswers === undefined
      ? {}
      : { confirmedAnswers: structuredClone(confirmedAnswers) };
  const sets: WorkflowDraftValueEdit[] = [];
  const removals: WorkflowDraftValueEdit[] = [];
  const pendingTargets: WorkflowDraftApiInputEditTarget[] = [];
  const enumSelections: VerifiedWorkflowDraftApiEnumSelection[] = [];
  const { candidates } = describeWorkflowDraftApiInputEditEnumChoices(input);
  for (const target of input.contract.targets) {
    if (target.kind === 'remove') {
      removals.push({ kind: 'remove', pointer: target.pointer });
      continue;
    }
    const answer = output.values[target.id];
    if (answer.status === 'oas-enum') {
      const selection = verifyWorkflowDraftApiEnumSelection({
        selection: answer.selection,
        candidates: candidates.filter(
          (candidate) => candidate.targetPointer === target.pointer,
        ),
        messages: described.messages,
      });
      sets.push({
        kind: 'set',
        pointer: target.pointer,
        value: structuredClone(selection.value),
      });
      enumSelections.push(selection);
      continue;
    }
    if (answer.explanation)
      validateWorkflowPlanningEvidence({
        context: { messages: described.messages },
        evidence: answer.explanation.evidence,
      });
    if (answer.status === 'needs-input') {
      const confirmed = confirmedAnswers?.answers.find(
        (item) => item.targetId === target.id,
      );
      if (confirmed === undefined) pendingTargets.push(structuredClone(target));
      else
        sets.push({
          kind: 'set',
          pointer: target.pointer,
          value: structuredClone(confirmed.value),
        });
      continue;
    }
    const message = described.messages.find(
      (message) => message.id === answer.source.messageId,
    );
    if (!message)
      throw new Error(
        `API input edit ${target.pointer} value source is absent from the current request`,
      );
    verifyApiInputLiteralSource({
      ...answer.source,
      text: message.text,
      value: answer.value,
      label: `API input edit ${target.pointer}`,
    });
    sets.push({ kind: 'set', pointer: target.pointer, value: answer.value });
  }
  if (pendingTargets.length)
    return {
      status: 'needs-input',
      contractId: input.contract.id,
      values: output,
      pendingTargets,
      ...human,
      ...(enumSelections.length ? { enumSelections } : {}),
    };
  // Targets address the original value. Set before deletion; remove higher array
  // indices first so one deletion does not retarget another original index.
  const edits = orderWorkflowDraftValueEdits([...sets, ...removals]);
  const selected = {
    callId: described.call.id,
    operation: described.operation,
    bindings: described.call.bindings,
    ...(described.call.requestedInputs === undefined
      ? {}
      : { requestedInputs: described.call.requestedInputs }),
    requestMediaType: described.call.requestMediaType,
  };
  const values = applyWorkflowDraftApiInputEdits(
    described.call.values,
    edits,
    selected,
  );
  validateApiArguments({ ...selected, values });
  return {
    status: 'ready',
    contractId: input.contract.id,
    values: output,
    ...human,
    ...(enumSelections.length ? { enumSelections } : {}),
    resolution: {
      stepId: input.stepId,
      kind: 'api-inputs',
      edits,
      ...(input.contract.requestMediaType === undefined
        ? {}
        : { requestMediaType: input.contract.requestMediaType }),
    },
  };
}
