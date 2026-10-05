import { node } from '@n8n/workflow-sdk';
import type { N8nNativeCapability } from '../../types/native-capability.js';
import { mergeParametersSchema } from '../../schemas/native-capability-schemas.js';
import { createNativeFragment } from './common/create-native-fragment.js';

export function createMergeAppendCapability(): N8nNativeCapability {
  return {
    name: 'merge-append',
    description:
      'n8n Merge append: input1..inputN; main output. Waits for all independent incoming branches.',
    parametersSchema: mergeParametersSchema,
    inputPorts: (parameters) =>
      Array.from(
        { length: mergeParametersSchema.parse(parameters).numberInputs },
        (_, index) => `input${index + 1}`,
      ),
    outputPorts: () => ['main'],
    responseReferences: () => [],
    waitsForAllInputs: true,
    exclusiveOutputPorts: false,
    compile: ({ planned, position }) => {
      const parameters = mergeParametersSchema.parse(planned.parameters);
      return createNativeFragment(
        node({
          type: 'n8n-nodes-base.merge',
          version: 3.2,
          config: {
            id: planned.id,
            name: planned.id,
            position,
            parameters: {
              mode: 'append',
              numberInputs: parameters.numberInputs,
            },
          },
        }),
        Array.from(
          { length: parameters.numberInputs },
          (_, index) => `input${index + 1}`,
        ),
        ['main'],
      );
    },
  };
}
