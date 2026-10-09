import { node } from '@n8n/workflow-sdk';
import type {
  N8nNativeCapability,
  NativeItemExecutionOptions,
} from '../../types/native-capability.js';
import { ifParametersSchema } from '../../schemas/native-capability-schemas.js';
import { createNativeFragment } from './common/create-native-fragment.js';
import { responseReferences } from './common/response-references.js';
import { conditionExpression } from './response-check-code.js';

export function createIfCapability(
  input: NativeItemExecutionOptions = {},
): N8nNativeCapability {
  return {
    name: 'if',
    description:
      'n8n IF: main input; true and false OUTPUT PORTS are mutually exclusive. Multiple edges from the SAME port all execute (fan-out) and can be joined. Type-strict declarative conditions.',
    parametersSchema: ifParametersSchema,
    inputPorts: () => ['main'],
    outputPorts: () => ['true', 'false'],
    responseReferences: (parameters) =>
      responseReferences(ifParametersSchema.parse(parameters).conditions),
    waitsForAllInputs: false,
    exclusiveOutputPorts: true,
    compile: ({ planned, apiNodeNames, position }) => {
      const parameters = ifParametersSchema.parse(planned.parameters);
      return createNativeFragment(
        node({
          type: 'n8n-nodes-base.if',
          version: 2.2,
          config: {
            id: planned.id,
            name: planned.id,
            position,
            parameters: {
              conditions: {
                options: {
                  caseSensitive: true,
                  leftValue: '',
                  typeValidation: 'strict',
                  version: 2,
                },
                conditions: parameters.conditions.map((check, index) => ({
                  id: `${planned.id}-${index}`,
                  leftValue: conditionExpression(
                    check,
                    apiNodeNames,
                    input.itemMode === 'linked',
                  ),
                  rightValue: true,
                  operator: { type: 'boolean', operation: 'equals' },
                })),
                combinator: parameters.combinator,
              },
              options: {},
            },
          },
        }),
        ['main'],
        ['true', 'false'],
      );
    },
  };
}
