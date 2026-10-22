import type { WorkflowDraftApiInputEditContractInput } from '../../../types/workflow-draft-api-input-edit.js';
import type { WorkflowDraftApiEnumChoicesDescription } from '../../../types/workflow-draft-api-enum-selection.js';
import { validateWorkflowDraftApiInputEditContract } from './validate-workflow-draft-api-input-edit-contract.js';
import { describeWorkflowDraftApiInputEdit } from './describe-workflow-draft-api-input-edit.js';
import { createSchemaResourceContext } from '../../../bindings/resources/create-schema-resource-context.js';
import { listApiInputEnumCandidates } from '../../../arguments/enum/list-api-input-enum-candidates.js';

/** Only previously validated set-targets; never advertise remove targets, bindings or unrelated fields. */
export function describeWorkflowDraftApiInputEditEnumChoices(
  input: WorkflowDraftApiInputEditContractInput,
): WorkflowDraftApiEnumChoicesDescription {
  validateWorkflowDraftApiInputEditContract(input);
  if (
    input.selectOasEnums !== undefined &&
    typeof input.selectOasEnums !== 'boolean'
  )
    throw new Error('API input edit selectOasEnums must be a boolean');
  const result: WorkflowDraftApiEnumChoicesDescription = {
    candidates: [],
    targets: [],
  };
  if (input.selectOasEnums !== true) return result;
  const description = describeWorkflowDraftApiInputEdit(input);
  const resources = createSchemaResourceContext(input.contract.schemaResource);
  for (const target of input.contract.targets) {
    if (target.kind !== 'set') continue;
    const candidates = listApiInputEnumCandidates({
      source: {
        kind: 'operation',
        callId: description.call.id,
        operation: description.operation,
        requestMediaType: description.call.requestMediaType,
        targetPointer: target.pointer,
      },
      schemas: [target.schema],
      resources,
    });
    if (candidates.length) {
      result.candidates.push(...candidates);
      result.targets.push({
        targetPointer: target.pointer,
        schema: resources.bundle(target.schema),
      });
    }
  }
  return result;
}
