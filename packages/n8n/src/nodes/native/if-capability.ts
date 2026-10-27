import { node } from '@n8n/workflow-sdk';
import type {
  N8nNativeCapability,
  NativeItemExecutionOptions,
} from '../../types/native-capability.js';
import { ifParametersSchema } from '../../schemas/native-capability-schemas.js';
import { createIfPlanningParametersSchema } from '../../schemas/create-native-comparison-planning-schema.js';
import { createNativeFragment } from './common/create-native-fragment.js';
import { responseReferences } from './common/response-references.js';
import {
  comparisonReferenceBindings,
  comparisonNodeOutputReferences,
} from './common/comparison-value-references.js';
import { createComparisonConditionExpression } from './comparisons/create-comparison-evaluation-code.js';
import { createComparisonInputReader } from './comparisons/create-comparison-input-reader.js';
import { createComparisonInputGuard } from './comparisons/create-comparison-input-guard.js';

export function createIfCapability(
  input: NativeItemExecutionOptions = {},
): N8nNativeCapability {
  return {
    name: 'if',
    description:
      'n8n IF: compare supplied API responses or actual native JSON outputs without conversion. main input; true and false OUTPUT PORTS are mutually exclusive. Multiple edges from the SAME port all execute (fan-out) and can be joined. Type-strict declarative conditions.',
    parametersSchema: ifParametersSchema,
    parameterReferenceSources: ['response', 'node-output'],
    createPlanningParametersSchema: createIfPlanningParametersSchema,
    inputPorts: () => ['main'],
    outputPorts: () => ['true', 'false'],
    responseReferences: (parameters) =>
      responseReferences(ifParametersSchema.parse(parameters).conditions),
    nodeOutputReferences: (parameters) =>
      comparisonNodeOutputReferences(
        ifParametersSchema.parse(parameters).conditions,
      ),
    parameterReferenceBindings: (parameters) =>
      comparisonReferenceBindings(
        ifParametersSchema.parse(parameters).conditions,
        '/conditions',
      ),
    waitsForAllInputs: false,
    exclusiveOutputPorts: true,
    compile: ({
      planned,
      apiNodeNames,
      apiResponseContracts,
      singletonApiResponseIds,
      nativeOutputSources,
      position,
    }) => {
      const parameters = ifParametersSchema.parse(planned.parameters);
      const reader = createComparisonInputReader({
        nodeId: planned.id,
        checks: parameters.conditions,
        apiNodeNames,
        apiResponseContracts,
        singletonApiResponseIds,
        nativeOutputSources,
        linked: input.itemMode === 'linked',
      });
      const fragment = createNativeFragment(
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
                  leftValue: createComparisonConditionExpression(
                    check,
                    reader.bindingSources,
                    input.itemMode === 'linked',
                    singletonApiResponseIds,
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
      const partition = { ...fragment, partitionsInputItems: true };
      if (!reader.bindingSources.length) return partition;
      const guard = createComparisonInputGuard({
        nodeId: planned.id,
        readerCode: reader.code,
        linked: input.itemMode === 'linked',
        position,
      });
      return {
        ...partition,
        entry: guard,
        nodes: [guard, ...fragment.nodes],
        internalEdges: [
          { from: guard.id, output: 0, to: fragment.entry.id, input: 0 },
        ],
        bindingSources: reader.bindingSources,
      };
    },
  };
}
