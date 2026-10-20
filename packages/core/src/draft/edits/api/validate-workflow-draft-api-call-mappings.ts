import type {
  WorkflowDraftApiCallBindingsDescription,
  ProposedWorkflowDraftApiCallMapping,
} from '../../../types/workflow-draft-api-call-planning.js';
import type { OutputBinding } from '../../../types/api-arguments.js';
import { validateApiArguments } from '../../../arguments/validate-api-arguments.js';
import { validateApiBindingAssignment } from '../../../bindings/validate-api-binding-assignment.js';

/** Shared by model mappings, proposed question alternatives and explicit human answers. */
export function validateWorkflowDraftApiCallMappings(
  description: WorkflowDraftApiCallBindingsDescription,
  mappings: ProposedWorkflowDraftApiCallMapping[],
): OutputBinding[] {
  if (description.inputIntent !== undefined)
    for (const mapping of mappings)
      if (!description.inputIntent.targets.includes(mapping.targetPointer))
        throw new Error(
          `API binding target ${mapping.targetPointer} is outside the selected input intent`,
        );
  const bindings = mappings.map((mapping) => ({
    kind: 'node-output' as const,
    ...mapping,
  }));
  const material = {
    callId: description.nodeId,
    operation: description.operation,
    requestMediaType: description.requestMediaType,
  };
  validateApiArguments({ ...material, values: {}, bindings });
  for (const binding of bindings)
    validateApiBindingAssignment({
      callId: description.nodeId,
      binding,
      materials: [
        material,
        ...description.sources.values.flatMap((source) =>
          source.kind === 'api'
            ? [{ callId: source.nodeId, operation: source.operation }]
            : [],
        ),
      ],
      nativeOutputs: description.sources.values.flatMap((source) =>
        source.kind === 'native'
          ? [{ nodeId: source.nodeId, schema: source.schema }]
          : [],
      ),
    });
  return bindings;
}
