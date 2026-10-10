import { node } from '@n8n/workflow-sdk';
import { readFileSync } from 'node:fs';
import { createResponseValueSchema } from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type { CreateItemJoinCapabilityInput } from '../../../types/item-join.js';
import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import { createItemJoinParametersSchema } from '../../../schemas/item-join-schema.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { createItemJoinReaderCode } from './create-item-join-reader-code.js';

export function createItemJoinCapability({
  materials,
  scopes,
}: CreateItemJoinCapabilityInput): N8nNativeCapability {
  const apis = new Map(
    materials.map((material) => [material.callId, material]),
  );
  const scopeById = new Map(scopes.map((scope) => [scope.nodeId, scope]));
  if (
    apis.size !== materials.length ||
    materials.some((material) => !material.callId.trim())
  )
    throw new Error('item join materials require unique non-empty callIds');
  if (
    scopeById.size !== scopes.length ||
    scopes.some((scope) => !scope.nodeId.trim() || !scope.nodeName.trim())
  )
    throw new Error(
      'item join scopes require unique non-empty identities and compiled names',
    );
  const parametersSchema = createItemJoinParametersSchema(
    [...scopeById.keys()],
    [...apis.keys()],
  );
  const ports = (count: number) =>
    Array.from({ length: count }, (_, i) => `input${i + 1}`);
  return {
    name: 'join-api-items',
    description:
      'Join API branches by their shared native scope item ancestry. Each participating item requires exactly one full OAS-valid response per API. Different orders and duplicate JSON values are safe. Missing/duplicate branch responses fail; no business-ID matching, index zip, Cartesian product or value conversion. Output {responses: {callId: unchangedBody}}.',
    parametersSchema,
    inputPorts: (values) =>
      ports(parametersSchema.parse(values).sourceCallIds.length),
    outputPorts: () => ['main'],
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
    waitsForAllInputs: true,
    exclusiveOutputPorts: false,
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
    compile: ({ planned, position, apiNodeNames }) => {
      const parameters = parametersSchema.parse(planned.parameters);
      const scope = scopeById.get(parameters.scopeNodeId)!;
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
          ports(readers.length).map((port) => [port, 0]),
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
  };
}
