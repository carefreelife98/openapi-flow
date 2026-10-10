import { node } from '@n8n/workflow-sdk';
import type { N8nNativeCapability } from '../../types/native-capability.js';
import { passThroughParametersSchema } from '../../schemas/native-capability-schemas.js';
import { createNativeFragment } from './common/create-native-fragment.js';

/** An explicit identity step; never generate a request, value or completion item. */
export function createPassThroughCapability(): N8nNativeCapability {
  return {
    name: 'pass-through',
    description:
      'n8n No Operation: forward all input items unchanged with their original links. Main input/output, no configuration or new data. Can provide a common entry before a fan-out. This does not merge branches, collect results or replace a missing API.',
    parametersSchema: passThroughParametersSchema,
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    compile: ({ planned, position }) => {
      passThroughParametersSchema.parse(planned.parameters);
      const fragment = createNativeFragment(
        node({
          type: 'n8n-nodes-base.noOp',
          version: 1,
          config: {
            id: planned.id,
            name: planned.id,
            position,
            parameters: {},
          },
        }),
        ['main'],
        ['main'],
      );
      return { ...fragment, preservesInputItems: true };
    },
  };
}
