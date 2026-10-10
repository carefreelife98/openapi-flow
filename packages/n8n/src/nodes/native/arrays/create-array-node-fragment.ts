import { node } from '@n8n/workflow-sdk';
import type { CreateArrayNodeFragmentInput } from '../../../types/array-split.js';
import type { N8nNodeFragment } from '../../../types/node-fragment.js';
import { createArrayReaderCode } from './create-array-reader-code.js';

/** Share SDK array mechanics without merging API and native source contracts. */
export function createArrayNodeFragment({
  planned,
  position,
  source,
  parameters,
  linked,
}: CreateArrayNodeFragmentInput): N8nNodeFragment {
  const extract = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: `${planned.id}-read-array`,
      name: `Read array ${planned.id}`,
      position,
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: createArrayReaderCode(source, parameters, linked),
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
    bindingSources: [source],
    nodes: [extract, split],
    entry: extract,
    exit: split,
    inputPorts: { main: 0 },
    outputPorts: { main: 0 },
    internalEdges: [{ from: extract.id, output: 0, to: split.id, input: 0 }],
  };
}
