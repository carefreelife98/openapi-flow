import { node } from '@n8n/workflow-sdk';
import { readFileSync } from 'node:fs';
import { createResponseArrayItemSchema } from '@openapi-flow/core';
import type { ApiBindingMaterial } from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../types/native-capability.js';
import type {
  CreateResponseArrayCapabilityInput,
  ResponseArrayParameters,
} from '../../types/array-iteration.js';
import { createResponseArrayParametersSchema } from '../../schemas/response-array-schema.js';
import { createOutputReaderCode } from '../request/bindings/create-output-reader-code.js';
import { javascriptJsonLiteral } from '../../utils/javascript-json-literal.js';

export function createResponseArrayCapability(
  input: CreateResponseArrayCapabilityInput,
): N8nNativeCapability {
  const materials = new Map(
    input.materials.map((material) => [material.callId, material]),
  );
  if (
    !materials.size ||
    materials.size !== input.materials.length ||
    input.materials.some((material) => !material.callId.trim())
  )
    throw new Error('response array capability requires unique API materials');
  const parametersSchema = createResponseArrayParametersSchema([
    ...materials.keys(),
  ]);
  function source(parameters: ResponseArrayParameters): ApiBindingMaterial {
    const material = materials.get(parameters.sourceNodeId);
    if (!material)
      throw new Error(
        `response array: unknown sourceNodeId ${parameters.sourceNodeId}`,
      );
    createResponseArrayItemSchema(material.operation, parameters.pointer);
    return material;
  }
  return {
    name: 'split-api-response-array',
    description:
      'Split a declared OAS response array into one unchanged JSON item per element using n8n Split Out. Output is {item: element}. Downstream bound requests must use linked item mode. An empty array creates no downstream items.',
    parametersSchema,
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: (values) => {
      const parameters = parametersSchema.parse(values);
      source(parameters);
      return [
        {
          source: 'response',
          nodeId: parameters.sourceNodeId,
          pointer: parameters.pointer,
        },
      ];
    },
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    outputSchema: (values) => {
      const parameters = parametersSchema.parse(values);
      return {
        type: 'object',
        properties: {
          item: createResponseArrayItemSchema(
            source(parameters).operation,
            parameters.pointer,
          ),
        },
        required: ['item'],
        additionalProperties: false,
      };
    },
    compile: ({ planned, position, apiNodeNames }) => {
      const parameters = parametersSchema.parse(planned.parameters);
      const material = source(parameters);
      if (
        !Object.hasOwn(apiNodeNames, material.callId) ||
        !apiNodeNames[material.callId].trim()
      )
        throw new Error(`apiNodeNames is missing ${material.callId}`);
      const runtime = readFileSync(
        new URL(
          '../request/runtime/request-runtime.bundle.js',
          import.meta.url,
        ),
        'utf8',
      );
      const read = createOutputReaderCode([
        {
          kind: 'api-response',
          nodeId: material.callId,
          nodeName: apiNodeNames[material.callId],
          operation: material.operation,
        },
      ]);
      const extract = node({
        type: 'n8n-nodes-base.code',
        version: 2,
        config: {
          id: `${planned.id}-read-array`,
          name: `Read array ${planned.id}`,
          position,
          parameters: {
            mode: 'runOnceForAllItems',
            jsCode: `${runtime}\nconst inputItems=$input.all();if(inputItems.length!==1)throw new Error('Response array extraction requires one input item; got '+inputItems.length);\n${read}\nconst parameters=${javascriptJsonLiteral(parameters)};\nconst array=OpenApiFlowRequestRuntime.pointerValue(responses[parameters.sourceNodeId],parameters.pointer);if(!Array.isArray(array))throw new Error('Response '+parameters.sourceNodeId+parameters.pointer+' must be an array');return [{json:{items:array},pairedItem:{item:0}}];`,
          },
        },
      });
      const split = node({
        type: 'n8n-nodes-base.splitOut',
        version: 1,
        config: {
          id: planned.id,
          name: planned.id,
          position: [position[0] + 220, position[1]],
          parameters: {
            fieldToSplitOut: 'items',
            include: 'noOtherFields',
            options: { destinationFieldName: 'item', disableDotNotation: true },
          },
        },
      });
      return {
        nodeId: planned.id,
        nodes: [extract, split],
        entry: extract,
        exit: split,
        inputPorts: { main: 0 },
        outputPorts: { main: 0 },
        internalEdges: [
          { from: extract.id, output: 0, to: split.id, input: 0 },
        ],
      };
    },
  };
}
