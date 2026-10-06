import { node } from '@n8n/workflow-sdk';
import type { CreateGapNodeInput } from '../../types/reviewable-workflow.js';
import type { N8nNodeFragment } from '../../types/node-fragment.js';
import { javascriptJsonLiteral } from '../../utils/javascript-json-literal.js';

export function createGapNode(input: CreateGapNodeInput): N8nNodeFragment {
  if (!input.nodeId.trim() || !input.gaps.length)
    throw new Error('gap node requires an ID and reported gaps');
  const message =
    'OPENAPI_FLOW_UNRESOLVED_STEP ' +
    input.nodeId +
    ': ' +
    input.gaps.map((gap) => gap.description).join('; ');
  const placeholder = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: input.nodeId,
      name: 'Unresolved ' + input.nodeId,
      position: input.position,
      onError: 'stopWorkflow',
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `throw new Error(${javascriptJsonLiteral(message)});`,
      },
    },
  });
  return {
    nodeId: input.nodeId,
    nodes: [placeholder],
    entry: placeholder,
    exit: placeholder,
    inputPorts: { main: 0 },
    outputPorts: { main: 0 },
  };
}
