import { node } from '@n8n/workflow-sdk';
import { readFileSync } from 'node:fs';
import type { CompileApiResponseResultsInput } from '../../../types/api-response-results.js';
import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import type { N8nNodeFragment } from '../../../types/node-fragment.js';
import { createOutputReaderCode } from '../../request/bindings/create-output-reader-code.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { createMergeAppendCapability } from '../merge-append-capability.js';
import { apiResponseResultsDefinition } from './api-response-results-definition.js';

export function compileApiResponseResults(
  input: CompileApiResponseResultsInput,
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
  const provenance = input.materials.map(({ callId, operation }) => ({
    callId,
    documentId: operation.key.documentId,
    method: operation.method,
    path: operation.path,
  }));
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
  const readPosition: CompileApiResponseResultsInput['position'] = [
    position[0] + (join === undefined ? 0 : 220),
    position[1],
  ];
  const extract = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: `${planned.id}-read-response-results`,
      name: `Read response results ${planned.id}`,
      position: readPosition,
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `${runtime}\n${reader}\nconst provenance=${javascriptJsonLiteral(provenance)};\nreturn provenance.map(source=>({json:{...source,body:responses[source.callId]},pairedItem:$input.all().map((_,item)=>({item}))}));`,
      },
    },
  });
  const aggregate = node({
    type: 'n8n-nodes-base.aggregate',
    version: 1,
    config: {
      id: planned.id,
      name: planned.id,
      position: [readPosition[0] + 220, readPosition[1]],
      parameters: {
        aggregate: 'aggregateAllItemData',
        destinationFieldName: 'results',
        include: 'allFields',
        options: { includeBinaries: false },
      },
    },
  });
  return {
    nodeId: planned.id,
    nodes: [...(join === undefined ? [] : join.nodes), extract, aggregate],
    entry: join === undefined ? extract : join.entry,
    exit: aggregate,
    inputPorts: Object.fromEntries(
      apiResponseResultsDefinition
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
      { from: extract.id, output: 0, to: aggregate.id, input: 0 },
    ],
    bindingSources: sources,
  };
}
