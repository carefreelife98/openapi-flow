import type {
  N8nNodeFragment,
  N8nSdkNode,
} from '../../../types/node-fragment.js';
export function createNativeFragment(
  sdkNode: N8nSdkNode,
  inputs: string[],
  outputs: string[],
): N8nNodeFragment {
  return {
    nodeId: sdkNode.id,
    nodes: [sdkNode],
    entry: sdkNode,
    exit: sdkNode,
    inputPorts: Object.fromEntries(inputs.map((port, index) => [port, index])),
    outputPorts: Object.fromEntries(
      outputs.map((port, index) => [port, index]),
    ),
  };
}
