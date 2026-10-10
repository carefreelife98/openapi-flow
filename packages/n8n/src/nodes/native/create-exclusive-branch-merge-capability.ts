import { node } from '@n8n/workflow-sdk';
import type { N8nNativeCapability } from '../../types/native-capability.js';
import { exclusiveBranchMergeParametersSchema } from '../../schemas/exclusive-branch-merge-schema.js';
import { createNativeFragment } from './common/create-native-fragment.js';

/** Separate semantic contract from the all-independent-inputs Merge capability. */
export function createExclusiveBranchMergeCapability(): N8nNativeCapability {
  return {
    name: 'rejoin-exclusive-branches',
    description:
      'Rejoin both alternative paths of one supplied IF instance using official Merge append. input1 and input2 each cover a distinct true/false path. Preserves existing items and ancestry; never creates an empty completion item. Both paths must return, including a skip path when no business call is required.',
    parametersSchema: exclusiveBranchMergeParametersSchema,
    inputPorts: () => ['input1', 'input2'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    rejoinsExclusiveOutputs: (parameters) =>
      exclusiveBranchMergeParametersSchema.parse(parameters).sourceNodeId,
    compile: ({ planned, position }) => {
      const { sourceNodeId } = exclusiveBranchMergeParametersSchema.parse(
        planned.parameters,
      );
      return {
        ...createNativeFragment(
          node({
            type: 'n8n-nodes-base.merge',
            version: 3.2,
            config: {
              id: planned.id,
              name: planned.id,
              position,
              parameters: { mode: 'append', numberInputs: 2 },
            },
          }),
          ['input1', 'input2'],
          ['main'],
        ),
        rejoinsExclusiveOutputs: sourceNodeId,
      };
    },
  };
}
