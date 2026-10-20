import type { ApiArgumentValues } from '../../../types/api-arguments.js';
import type { WorkflowDraftApiInputEditMaterial } from '../../../types/workflow-draft-api-input-edit.js';
import type { WorkflowDraftValueEdit } from '../../../types/workflow-draft-edit-assembly.js';
import { pointerTokens, hasPointer } from '../../../bindings/json-pointer.js';
import { requestBindingSchemas } from '../../../bindings/request-binding-schema.js';
import { assignRequestInputValue } from '../../../bindings/assign-request-input-value.js';
import { applyWorkflowDraftValueEdits } from './apply-workflow-draft-value-edits.js';
import { workflowDraftApiCallSchema } from '../../../schemas/workflow-draft-schema.js';
import { retainRequestedApiInputsAfterEdits } from '../inputs/retain-requested-api-inputs-after-edits.js';

export function applyWorkflowDraftApiInputEdits(
  values: ApiArgumentValues,
  edits: WorkflowDraftValueEdit[],
  material: WorkflowDraftApiInputEditMaterial,
): ApiArgumentValues {
  let result = structuredClone(values);
  for (const edit of edits) {
    const tokens = pointerTokens(edit.pointer);
    if (
      edit.kind === 'remove' &&
      !hasPointer(result, edit.pointer) &&
      material.requestedInputs !== undefined &&
      retainRequestedApiInputsAfterEdits(material.requestedInputs, [edit])
        .length !== material.requestedInputs.length
    )
      // The declared intent is the existing object being removed. There is no
      // literal to delete; final assembly removes this metadata in the same edit.
      continue;
    const parameterGroup =
      tokens.length === 1 &&
      material.operation.effective.parameters.some(
        (parameter) => parameter.in === tokens[0],
      );
    if (
      edit.kind === 'set' &&
      !parameterGroup &&
      !requestBindingSchemas(material, edit.pointer).length
    )
      throw new Error(
        `Draft input edit ${material.callId}${edit.pointer} is not declared by its OAS`,
      );
    result =
      edit.kind === 'set' && !hasPointer(result, edit.pointer)
        ? assignRequestInputValue(result, edit.pointer, edit.value, material)
        : workflowDraftApiCallSchema.shape.values.parse(
            applyWorkflowDraftValueEdits({
              value: result,
              edits: [edit],
              source: `Draft API ${material.callId}`,
            }),
          );
  }
  return result;
}
