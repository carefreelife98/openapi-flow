import type { ResolveWorkflowDraftApiInputEditsInput } from '../../../types/workflow-draft-api-input-edit.js';
import type { ApiInputRequirement } from '../../../types/api-clarification.js';
import { describeWorkflowDraftApiInputEdit } from './describe-workflow-draft-api-input-edit.js';
import { resolveWorkflowDraftApiInputEdits } from './resolve-workflow-draft-api-input-edits.js';
import { createSchemaResourceContext } from '../../../bindings/resources/create-schema-resource-context.js';

/** Questions for actual pending set-targets, retaining references and declaring the compiled dialect. */
export function describeWorkflowDraftApiInputEditAnswerRequirements(
  input: ResolveWorkflowDraftApiInputEditsInput,
): ApiInputRequirement[] {
  const result = resolveWorkflowDraftApiInputEdits(input);
  if (result.status === 'ready') return [];
  const described = describeWorkflowDraftApiInputEdit(input);
  const resources = createSchemaResourceContext(input.contract.schemaResource);
  return result.pendingTargets.map((target): ApiInputRequirement => {
    if (target.kind !== 'set')
      throw new Error(
        `Pending API edit ${input.contract.id}:${target.id} is not a set-target`,
      );
    return {
      kind: 'requested-input',
      id: `${input.contract.id}:${target.id}`,
      callId: described.call.id,
      operation: structuredClone(described.operation.key),
      targetPointer: target.pointer,
      schema: resources.bundle(target.schema),
      openapiVersion: described.operation.openapiVersion,
      schemaDialect: 'draft-2020-12',
      requestedInputs: [target.pointer],
      ...(typeof described.operation.operation.summary === 'string'
        ? { operationSummary: described.operation.operation.summary }
        : {}),
      message: `Provide the new explicitly requested value at ${target.pointer}. The existing value is not an answer to this edit.`,
    };
  });
}
