import type {
  ResolveWorkflowDraftApiInputEditsInput,
  WorkflowDraftApiInputEditResult,
  WorkflowDraftApiInputEditTarget,
} from '../../../types/workflow-draft-api-input-edit.js';
import type { WorkflowDraftValueEdit } from '../../../types/workflow-draft-edit-assembly.js';
import { createWorkflowDraftApiInputEditValuesSchema } from '../../../schemas/create-workflow-draft-api-input-edit-values-schema.js';
import { describeWorkflowDraftApiInputEdit } from './describe-workflow-draft-api-input-edit.js';
import { validateWorkflowPlanningEvidence } from '../../../planning/evidence/validate-workflow-planning-evidence.js';
import { applyWorkflowDraftApiInputEdits } from '../values/apply-workflow-draft-api-input-edits.js';
import { resolveWorkflowDraftApiMaterials } from '../../resolve-workflow-draft-api-materials.js';
import { validateApiArguments } from '../../../arguments/validate-api-arguments.js';
import { orderWorkflowDraftValueEdits } from '../values/order-workflow-draft-value-edits.js';
import { verifyApiInputLiteralSource } from '../../../arguments/sources/verify-api-input-literal-source.js';

/** Exact-source validation is deterministic; it is not semantic entailment proof. */
export function resolveWorkflowDraftApiInputEdits(
  input: ResolveWorkflowDraftApiInputEditsInput,
): WorkflowDraftApiInputEditResult {
  const output = createWorkflowDraftApiInputEditValuesSchema(input).parse(
    input.output,
  );
  const described = describeWorkflowDraftApiInputEdit(input);
  const sets: WorkflowDraftValueEdit[] = [];
  const removals: WorkflowDraftValueEdit[] = [];
  const pendingTargets: WorkflowDraftApiInputEditTarget[] = [];
  for (const target of input.contract.targets) {
    if (target.kind === 'remove') {
      removals.push({ kind: 'remove', pointer: target.pointer });
      continue;
    }
    const answer = output.values[target.id];
    if (answer.explanation)
      validateWorkflowPlanningEvidence({
        context: { messages: described.messages },
        evidence: answer.explanation.evidence,
      });
    if (answer.status === 'needs-input') {
      pendingTargets.push(structuredClone(target));
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
    };
  // Targets address the original value. Set before deletion; remove higher array
  // indices first so one deletion does not retarget another original index.
  const edits = orderWorkflowDraftValueEdits([...sets, ...removals]);
  const material = resolveWorkflowDraftApiMaterials({
    content: input.draft,
    context: input.context,
  }).find((item) => item.callId === described.call.id)!;
  const selected = {
    ...material,
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
