import { node } from '@n8n/workflow-sdk';
import type { CreateResponseCheckGuardInput } from '../../../types/response-check-guard.js';
import type { N8nSdkNode } from '../../../types/node-fragment.js';

/** Validate in Code, not inside n8n's expression-delimited IF parameter. */
export function createResponseCheckGuard({
  nodeId,
  readerCode,
  linked,
  position,
}: CreateResponseCheckGuardInput): N8nSdkNode {
  const forward = 'return {...item,pairedItem:{item:inputIndex}};';
  const code = linked
    ? `return $input.all().map((item,inputIndex)=>{${readerCode}\n${forward}});`
    : `${readerCode}\nreturn $input.all().map((item,inputIndex)=>{${forward}});`;
  return node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: `${nodeId}-response-contract`,
      name: `Validate responses ${nodeId}`,
      position: [position[0] - 220, position[1]],
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: code,
      },
    },
  });
}
