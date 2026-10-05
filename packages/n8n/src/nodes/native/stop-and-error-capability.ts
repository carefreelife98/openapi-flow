import { node } from '@n8n/workflow-sdk';
import type { N8nNativeCapability } from '../../types/native-capability.js';
import { stopParametersSchema } from '../../schemas/native-capability-schemas.js';
import { createNativeFragment } from './common/create-native-fragment.js';

export function createStopAndErrorCapability(): N8nNativeCapability {
  return {
    name: 'stop-and-error',
    description:
      'n8n StopAndError: main input, no outputs. Fail the workflow with an explicit message.',
    parametersSchema: stopParametersSchema,
    inputPorts: () => ['main'],
    outputPorts: () => [],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    compile: ({ planned, position }) =>
      createNativeFragment(
        node({
          type: 'n8n-nodes-base.stopAndError',
          version: 1,
          config: {
            id: planned.id,
            name: planned.id,
            position,
            parameters: {
              errorType: 'errorMessage',
              errorMessage: stopParametersSchema.parse(planned.parameters)
                .message,
            },
          },
        }),
        ['main'],
        [],
      ),
  };
}
