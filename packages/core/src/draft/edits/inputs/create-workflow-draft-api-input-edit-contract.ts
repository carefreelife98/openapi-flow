import { createHash } from 'node:crypto';
import type {
  CreateWorkflowDraftApiInputEditContractInput,
  WorkflowDraftApiInputEditContract,
  WorkflowDraftApiInputEditTarget,
} from '../../../types/workflow-draft-api-input-edit.js';
import { describeWorkflowDraftApiInputEdit } from './describe-workflow-draft-api-input-edit.js';
import { createWorkflowDraftApiInputEditProposalSchema } from '../../../schemas/workflow-draft-api-input-edit-proposal-schema.js';
import { validateWorkflowPlanningEvidence } from '../../../planning/evidence/validate-workflow-planning-evidence.js';
import { hasPointer, pointerTokens } from '../../../bindings/json-pointer.js';
import { schemasAtPointer } from '../../../bindings/schema-at-pointer.js';
import { createSchemaResourceContext } from '../../../bindings/resources/create-schema-resource-context.js';
import { retainRequestedApiInputsAfterEdits } from './retain-requested-api-inputs-after-edits.js';

/** Bind selected fields to original contracts. A proposed schema is never trusted. */
export function createWorkflowDraftApiInputEditContract(
  input: CreateWorkflowDraftApiInputEditContractInput,
): WorkflowDraftApiInputEditContract {
  const described = describeWorkflowDraftApiInputEdit(input);
  const proposal = createWorkflowDraftApiInputEditProposalSchema(
    input.requestMessageIds,
    described.includeExplanations,
  ).parse(input.proposal);
  const resources = createSchemaResourceContext(described.requestSchema);
  const seen: string[] = [];
  const targets = proposal.targets.map(
    (target, index): WorkflowDraftApiInputEditTarget => {
      const tokens = pointerTokens(target.pointer);
      if (
        !tokens.length ||
        seen.some(
          (pointer) =>
            pointer === target.pointer ||
            pointer.startsWith(target.pointer + '/') ||
            target.pointer.startsWith(pointer + '/'),
        )
      )
        throw new Error(
          `API input edit has duplicate or overlapping targets at ${target.pointer}`,
        );
      seen.push(target.pointer);
      if (
        described.call.bindings.some(
          (binding) =>
            binding.targetPointer === target.pointer ||
            binding.targetPointer.startsWith(target.pointer + '/') ||
            target.pointer.startsWith(binding.targetPointer + '/'),
        )
      )
        throw new Error(
          `API input edit ${target.pointer} overlaps binding ownership; use a binding edit instead`,
        );
      validateWorkflowPlanningEvidence({
        context: { messages: described.messages },
        evidence: target.sources,
      });
      if (target.explanation)
        validateWorkflowPlanningEvidence({
          context: { messages: described.messages },
          evidence: target.explanation.evidence,
        });
      if (
        target.kind === 'remove' &&
        !hasPointer(described.call.values, target.pointer) &&
        (described.call.requestedInputs === undefined ||
          retainRequestedApiInputsAfterEdits(described.call.requestedInputs, [
            { kind: 'remove', pointer: target.pointer },
          ]).length === described.call.requestedInputs.length)
      )
        throw new Error(
          `API input edit cannot remove absent value ${target.pointer}`,
        );
      const schema =
        target.kind === 'set'
          ? schemasAtPointer(resources.root, target.pointer, resources)[0]
          : undefined;
      if (target.kind === 'set' && schema === undefined)
        throw new Error(
          `API input edit target ${target.pointer} is not permitted by its OAS`,
        );
      const fields = { ...target, id: `value-${index + 1}` };
      return target.kind === 'remove'
        ? { ...fields, kind: 'remove' }
        : { ...fields, kind: 'set', schema: schema! };
    },
  );
  const fields = {
    planId: input.plan.id,
    stepId: input.stepId,
    nodeId: described.call.id,
    schemaResource: resources.root,
    targets,
    ...(described.call.requestMediaType === undefined
      ? {}
      : { requestMediaType: described.call.requestMediaType }),
  };
  return {
    id:
      'api-input-edit:' +
      createHash('sha256')
        .update(JSON.stringify([described.stageFingerprint, fields]))
        .digest('hex'),
    ...fields,
  };
}
