import { defineMaterialBoundCapability } from '../common/define-material-bound-capability.js';
import { node } from '@n8n/workflow-sdk';
import { readFileSync } from 'node:fs';
import {
  createResponseValueSchema,
  validateNativeOutputContracts,
} from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type { BoundItemJoinCapabilityInput } from '../../../types/native-material-binding.js';
import { resolveNativeRuntimeSource } from '../common/resolve-native-runtime-source.js';
import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import { createItemJoinParametersSchema } from '../../../schemas/item-join-schema.js';
import { itemJoinDefinition } from './item-join-definition.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { createItemJoinReaderCode } from './create-item-join-reader-code.js';

export function createBoundItemJoinCapability({
  materials,
  scopes,
  runtime: sourceBinding,
}: BoundItemJoinCapabilityInput): N8nNativeCapability {
  const apis = new Map(
    materials.map((material) => [material.callId, material]),
  );
  validateNativeOutputContracts(scopes);
  const scopeContracts = scopes.map(({ nodeId, schema }) => ({
    nodeId,
    schema,
  }));
  const scopeById = new Map(
    scopeContracts.map((scope) => [scope.nodeId, scope]),
  );
  if (
    apis.size !== materials.length ||
    materials.some((material) => !material.callId.trim())
  )
    throw new Error('item join materials require unique non-empty callIds');
  if (
    scopeById.size !== scopes.length ||
    scopes.some((scope) => !scope.nodeId.trim())
  )
    throw new Error(
      'item join scopes require unique non-empty contract identities',
    );
  const parametersSchema = createItemJoinParametersSchema(
    [...scopeById.keys()],
    [...apis.keys()],
  );
  return defineMaterialBoundCapability({
    ...itemJoinDefinition,
    parametersSchema,
    materialSources: {
      apiMaterials: structuredClone(materials),
      nativeOutputs: structuredClone(scopeContracts),
    },
    bindMaterialContracts: (sources) =>
      createBoundItemJoinCapability({
        materials: sources.apiMaterials,
        scopes: sources.nativeOutputs,
        runtime: { kind: 'compiled' },
      }),
    responseReferences: (values) =>
      parametersSchema.parse(values).sourceCallIds.map((nodeId) => ({
        source: 'response',
        nodeId,
        pointer: '',
      })),
    nodeOutputReferences: (values) => [
      {
        source: 'node-output',
        nodeId: parametersSchema.parse(values).scopeNodeId,
        pointer: '',
      },
    ],
    inputReferences: (values) => {
      const parameters = parametersSchema.parse(values);
      return Object.fromEntries(
        parameters.sourceCallIds.map((nodeId, i) => [
          `input${i + 1}`,
          [
            { source: 'response', nodeId, pointer: '' },
            {
              source: 'node-output',
              nodeId: parameters.scopeNodeId,
              pointer: '',
            },
          ],
        ]),
      );
    },
    outputSchema: (values) => {
      const parameters = parametersSchema.parse(values);
      return {
        type: 'object',
        required: ['responses'],
        additionalProperties: false,
        properties: {
          responses: {
            type: 'object',
            additionalProperties: false,
            required: parameters.sourceCallIds,
            properties: Object.fromEntries(
              parameters.sourceCallIds.map((id) => [
                id,
                createResponseValueSchema(apis.get(id)!.operation, ''),
              ]),
            ),
          },
        },
      };
    },
    compile: ({ planned, position, apiNodeNames, nativeOutputSources }) => {
      const parameters = parametersSchema.parse(planned.parameters);
      const scope = resolveNativeRuntimeSource({
        binding: sourceBinding,
        contract: scopeById.get(parameters.scopeNodeId)!,
        compiledSources: nativeOutputSources,
        consumerId: planned.id,
      });
      const bindingSources: N8nOutputBindingSource[] = [
        { ...scope, kind: 'native-json' },
        ...parameters.sourceCallIds.map((id) => {
          if (!Object.hasOwn(apiNodeNames, id) || !apiNodeNames[id].trim())
            throw new Error(`item join apiNodeNames is missing ${id}`);
          return {
            kind: 'api-response' as const,
            nodeId: id,
            nodeName: apiNodeNames[id],
            operation: apis.get(id)!.operation,
          };
        }),
      ];
      const readers = parameters.sourceCallIds.map((id, index) =>
        node({
          type: 'n8n-nodes-base.code',
          version: 2,
          config: {
            id: `${planned.id}-read-${index}`,
            name: `Read branch ${index + 1} ${planned.id}`,
            position: [position[0], position[1] + index * 180],
            parameters: {
              mode: 'runOnceForAllItems',
              jsCode: createItemJoinReaderCode({
                scope,
                sourceCallId: id,
                sources: [bindingSources[0], bindingSources[index + 1]],
              }),
            },
          },
        }),
      );
      const merge = node({
        type: 'n8n-nodes-base.merge',
        version: 3.2,
        config: {
          id: `${planned.id}-wait`,
          name: `Wait branches ${planned.id}`,
          position: [position[0] + 220, position[1]],
          parameters: { mode: 'append', numberInputs: readers.length },
        },
      });
      const runtime = readFileSync(
        new URL('./runtime/item-join-runtime.bundle.js', import.meta.url),
        'utf8',
      );
      const joined = node({
        type: 'n8n-nodes-base.code',
        version: 2,
        config: {
          id: planned.id,
          name: planned.id,
          position: [position[0] + 440, position[1]],
          parameters: {
            mode: 'runOnceForAllItems',
            jsCode: `${runtime}\nreturn OpenApiFlowItemJoinRuntime.joinApiItems({items:$input.all(),sourceCallIds:${javascriptJsonLiteral(parameters.sourceCallIds)}});`,
          },
        },
      });
      return {
        nodeId: planned.id,
        joinsInputItemsByAncestry: { scopeNodeId: parameters.scopeNodeId },
        nodes: [...readers, merge, joined],
        entry: readers[0],
        exit: joined,
        inputPorts: Object.fromEntries(
          itemJoinDefinition.inputPorts(parameters).map((port) => [port, 0]),
        ),
        inputEndpoints: Object.fromEntries(
          readers.map((reader, i) => [
            `input${i + 1}`,
            { nodeId: reader.id, input: 0 },
          ]),
        ),
        outputPorts: { main: 0 },
        bindingSources,
        internalEdges: [
          ...readers.map((reader, index) => ({
            from: reader.id,
            output: 0,
            to: merge.id,
            input: index,
          })),
          { from: merge.id, output: 0, to: joined.id, input: 0 },
        ],
      };
    },
  });
}
