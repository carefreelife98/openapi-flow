import { node } from '@n8n/workflow-sdk';
import { readFileSync } from 'node:fs';
import { createResponseValueSchema } from '@openapi-flow/core';
import type { ApiBindingMaterial } from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../types/native-capability.js';
import type {
  CreateResponseCollectionCapabilityInput,
  ResponseCollectionParameters,
} from '../../types/response-collection.js';
import { createResponseCollectionParametersSchema } from '../../schemas/response-collection-schema.js';
import { createOutputReaderCode } from '../request/bindings/create-output-reader-code.js';
import { javascriptJsonLiteral } from '../../utils/javascript-json-literal.js';

export function createResponseCollectionCapability(
  input: CreateResponseCollectionCapabilityInput,
): N8nNativeCapability {
  const materials = new Map(
    input.materials.map((material) => [material.callId, material]),
  );
  if (
    !materials.size ||
    materials.size !== input.materials.length ||
    input.materials.some((material) => !material.callId.trim())
  )
    throw new Error(
      'response collection capability requires unique API materials',
    );
  const parametersSchema = createResponseCollectionParametersSchema([
    ...materials.keys(),
  ]);
  function source(
    parameters: ResponseCollectionParameters,
  ): ApiBindingMaterial {
    const material = materials.get(parameters.sourceNodeId);
    if (!material)
      throw new Error(
        `response collection: unknown sourceNodeId ${parameters.sourceNodeId}`,
      );
    createResponseValueSchema(material.operation, parameters.pointer);
    return material;
  }
  return {
    name: 'collect-api-responses',
    description:
      'Collect unchanged item-linked API response values from one incoming stream into {items: values} using n8n Aggregate. Validates each full OAS response first. Preserves null, nested arrays, duplicates and received order. Not a branch join. Empty streams do not trigger this node or create an artificial result.',
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
          items: {
            type: 'array',
            items: createResponseValueSchema(
              source(parameters).operation,
              parameters.pointer,
            ),
          },
        },
        required: ['items'],
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
      const read = createOutputReaderCode(
        [
          {
            kind: 'api-response',
            nodeId: material.callId,
            nodeName: apiNodeNames[material.callId],
            operation: material.operation,
          },
        ],
        true,
      );
      const extract = node({
        type: 'n8n-nodes-base.code',
        version: 2,
        config: {
          id: `${planned.id}-read-values`,
          name: `Read values ${planned.id}`,
          position,
          parameters: {
            mode: 'runOnceForAllItems',
            jsCode: `${runtime}\nconst parameters=${javascriptJsonLiteral(parameters)};\nreturn $input.all().map((_,inputIndex)=>{${read}\nconst value=OpenApiFlowRequestRuntime.pointerValue(responses[parameters.sourceNodeId],parameters.pointer);if(value===undefined)throw new Error('Missing response pointer '+parameters.sourceNodeId+parameters.pointer);return {json:{value},pairedItem:{item:inputIndex}};});`,
          },
        },
      });
      const aggregate = node({
        type: 'n8n-nodes-base.aggregate',
        version: 1,
        config: {
          id: planned.id,
          name: planned.id,
          position: [position[0] + 220, position[1]],
          parameters: {
            aggregate: 'aggregateIndividualFields',
            fieldsToAggregate: {
              fieldToAggregate: [
                {
                  fieldToAggregate: 'value',
                  renameField: true,
                  outputFieldName: 'items',
                },
              ],
            },
            options: {
              disableDotNotation: true,
              mergeLists: false,
              keepMissing: true,
              includeBinaries: false,
            },
          },
        },
      });
      return {
        nodeId: planned.id,
        bindingSources: [
          {
            kind: 'api-response',
            nodeId: material.callId,
            nodeName: apiNodeNames[material.callId],
            operation: material.operation,
          },
        ],
        nodes: [extract, aggregate],
        entry: extract,
        exit: aggregate,
        inputPorts: { main: 0 },
        outputPorts: { main: 0 },
        internalEdges: [
          { from: extract.id, output: 0, to: aggregate.id, input: 0 },
        ],
      };
    },
  };
}
