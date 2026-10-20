import { node } from '@n8n/workflow-sdk';
import { resolveNativeStructureParameters } from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../types/native-capability.js';
import { stopParametersSchema } from '../../schemas/native-capability-schemas.js';
import { createNativeFragment } from './common/create-native-fragment.js';
import { prependNativeParameterGuard } from './inputs/prepend-native-parameter-guard.js';

export function createStopAndErrorCapability(): N8nNativeCapability {
  const capability: N8nNativeCapability = {
    name: 'stop-and-error',
    description:
      'n8n StopAndError: main input, no outputs. Fail the workflow with an explicit message.',
    parametersSchema: stopParametersSchema,
    parameterReferenceSources: [],
    supportsRuntimeParameters: true,
    inputPorts: () => ['main'],
    outputPorts: () => [],
    responseReferences: () => [],
    parameterReferenceBindings: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    compile: (source) => {
      const { planned, position } = source;
      resolveNativeStructureParameters(planned, capability);
      const fragment = createNativeFragment(
        node({
          type: 'n8n-nodes-base.stopAndError',
          version: 1,
          config: {
            id: planned.id,
            name: planned.id,
            position,
            parameters: {
              errorType: 'errorMessage',
              errorMessage:
                planned.runtimeParameters !== undefined
                  ? '={{ $json.message }}'
                  : stopParametersSchema.parse(planned.parameters).message,
            },
          },
        }),
        ['main'],
        [],
      );
      return planned.runtimeParameters !== undefined
        ? prependNativeParameterGuard({ input: source, capability, fragment })
        : fragment;
    },
  };
  return capability;
}
