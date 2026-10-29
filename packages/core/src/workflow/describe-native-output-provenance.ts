import type { NativeOutputProvenance } from '../types/node-output.js';
import type { WorkflowCapability } from '../types/workflow-plan.js';
import type { JsonValueObject } from '../types/api-arguments.js';

/** Read only implementation-declared references from already validated parameters. */
export function describeNativeOutputProvenance(
  capability: WorkflowCapability,
  parameters: JsonValueObject,
): NativeOutputProvenance {
  return structuredClone({
    capability: capability.name,
    description: capability.description,
    references: [
      ...capability.responseReferences(parameters),
      ...(capability.nodeOutputReferences
        ? capability.nodeOutputReferences(parameters)
        : []),
      ...Object.values(
        capability.inputReferences
          ? capability.inputReferences(parameters)
          : {},
      ).flat(),
      ...(capability.rejoinsExclusiveOutputs
        ? [
            {
              source: 'exclusive-output' as const,
              nodeId: capability.rejoinsExclusiveOutputs(parameters),
            },
          ]
        : []),
    ],
  });
}
