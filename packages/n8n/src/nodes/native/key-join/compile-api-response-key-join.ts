import { node } from '@n8n/workflow-sdk';
import type { CompileApiResponseKeyJoinInput } from '../../../types/api-response-key-join.js';
import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import type { N8nNodeFragment } from '../../../types/node-fragment.js';
import { createKeyJoinReaderCode } from './create-key-join-reader-code.js';

export function compileApiResponseKeyJoin(
  input: CompileApiResponseKeyJoinInput,
): N8nNodeFragment {
  const { planned, parameters, position } = input;
  const sources: N8nOutputBindingSource[] = (['left', 'right'] as const).map(
    (side) => {
      const { material } = input[side];
      if (
        !Object.hasOwn(input.apiNodeNames, material.callId) ||
        !input.apiNodeNames[material.callId].trim()
      )
        throw new Error(`key join apiNodeNames is missing ${material.callId}`);
      return {
        kind: 'api-response',
        nodeId: material.callId,
        nodeName: input.apiNodeNames[material.callId],
        operation: material.operation,
      };
    },
  );
  const readers = (['left', 'right'] as const).map((side, index) =>
    node({
      type: 'n8n-nodes-base.code',
      version: 2,
      config: {
        id: `${planned.id}-read-${side}`,
        name: `Read ${side} ${planned.id}`,
        position: [position[0], position[1] + index * 180],
        parameters: {
          mode: 'runOnceForAllItems',
          language: 'javaScript',
          jsCode: createKeyJoinReaderCode({
            source: sources[index],
            selection: parameters[side],
            side,
            missingKeys: parameters.missingKeys,
          }),
        },
      },
    }),
  );
  const joinModes = {
    inner: 'keepMatches',
    full: 'keepEverything',
    left: 'enrichInput1',
    right: 'enrichInput2',
  } as const;
  const merge = node({
    type: 'n8n-nodes-base.merge',
    version: 3.2,
    config: {
      id: planned.id,
      name: planned.id,
      position: [position[0] + 220, position[1]],
      parameters: {
        mode: 'combine',
        combineBy: 'combineByFields',
        advanced: false,
        fieldsToMatchString: 'key',
        joinMode: joinModes[parameters.joinMode],
        outputDataFrom: 'both',
        options: {
          fuzzyCompare: false,
          multipleMatches: 'all',
          disableDotNotation: true,
          clashHandling: {
            values: {
              resolveClash: 'preferInput1',
              mergeMode: 'shallowMerge',
              overrideEmpty: false,
            },
          },
        },
      },
    },
  });
  return {
    nodeId: planned.id,
    nodes: [...readers, merge],
    entry: readers[0],
    exit: merge,
    inputPorts: { left: 0, right: 0 },
    inputEndpoints: {
      left: { nodeId: readers[0].id, input: 0 },
      right: { nodeId: readers[1].id, input: 0 },
    },
    outputPorts: { main: 0 },
    bindingSources: sources,
    internalEdges: readers.map((reader, index) => ({
      from: reader.id,
      output: 0,
      to: merge.id,
      input: index,
    })),
  };
}
