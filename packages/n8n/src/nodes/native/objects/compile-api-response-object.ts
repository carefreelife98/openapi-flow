import { node } from '@n8n/workflow-sdk';
import { readFileSync } from 'node:fs';
import type { CompileApiResponseObjectInput } from '../../../types/api-response-object.js';
import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import type { N8nNodeFragment } from '../../../types/node-fragment.js';
import { createOutputReaderCode } from '../../request/bindings/create-output-reader-code.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { createMergeAppendCapability } from '../merge-append-capability.js';
import { apiResponseObjectDefinition } from './api-response-object-definition.js';

export function compileApiResponseObject(
  input: CompileApiResponseObjectInput,
): N8nNodeFragment {
  const { planned, parameters, position } = input;
  const sources: N8nOutputBindingSource[] = input.materials.map((material) => {
    const nodeName = input.apiNodeNames[material.callId];
    if (
      !Object.hasOwn(input.apiNodeNames, material.callId) ||
      !nodeName?.trim()
    )
      throw new Error(`apiNodeNames is missing ${material.callId}`);
    return {
      kind: 'api-response',
      nodeId: material.callId,
      nodeName,
      operation: material.operation,
    };
  });
  const runtime = readFileSync(
    new URL('../../request/runtime/request-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const reader = createOutputReaderCode(sources);
  const join =
    sources.length > 1
      ? createMergeAppendCapability().compile({
          ...input,
          planned: {
            id: `${planned.id}-join-responses`,
            capability: 'merge-append',
            parameters: { numberInputs: sources.length },
          },
        })
      : undefined;
  const readPosition: CompileApiResponseObjectInput['position'] = [
    position[0] + (join === undefined ? 0 : 220),
    position[1],
  ];
  const extract = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: `${planned.id}-read-object-values`,
      name: `Read object values ${planned.id}`,
      position: readPosition,
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `${runtime}\n${reader}\nconst parameters=${javascriptJsonLiteral(parameters)};\nconst entries=parameters.fields.map(field=>{const value=OpenApiFlowRequestRuntime.pointerValue(responses[field.sourceNodeId],field.pointer);if(value===undefined)throw new Error('Missing response pointer '+field.sourceNodeId+field.pointer);return [field.name,value];});\nreturn [{json:Object.fromEntries(entries),pairedItem:$input.all().map((_,item)=>({item}))}];`,
      },
    },
  });
  const output = node({
    type: 'n8n-nodes-base.set',
    version: 3.4,
    config: {
      id: planned.id,
      name: planned.id,
      position: [readPosition[0] + 220, readPosition[1]],
      parameters: {
        mode: 'raw',
        jsonOutput: '={{ JSON.stringify($json) }}',
        includeOtherFields: false,
        options: { dotNotation: false },
      },
    },
  });
  return {
    nodeId: planned.id,
    nodes: [...(join === undefined ? [] : join.nodes), extract, output],
    entry: join === undefined ? extract : join.entry,
    exit: output,
    inputPorts: Object.fromEntries(
      apiResponseObjectDefinition
        .inputPorts(parameters)
        .map((port, index) => [port, index]),
    ),
    outputPorts: { main: 0 },
    internalEdges: [
      ...(join === undefined
        ? []
        : [
            ...(join.internalEdges === undefined ? [] : join.internalEdges),
            { from: join.exit.id, output: 0, to: extract.id, input: 0 },
          ]),
      { from: extract.id, output: 0, to: output.id, input: 0 },
    ],
    bindingSources: sources,
  };
}
