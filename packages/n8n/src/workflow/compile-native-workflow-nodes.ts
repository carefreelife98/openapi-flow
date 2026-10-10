import type { CompileNativeWorkflowNodesInput } from '../types/native-capability.js';
import type { N8nNodeFragment } from '../types/node-fragment.js';

export function compileNativeWorkflowNodes(
  input: CompileNativeWorkflowNodesInput,
): N8nNodeFragment[] {
  const names = Object.fromEntries(
    input.apiNodes.map((item) => [item.nodeId, item.exit.name]),
  );
  const apiResponseContracts = Object.fromEntries(
    input.materials.map((item) => [item.arguments.callId, item.operation]),
  );
  const nativeNodes = input.plan.nativeNodes.map((planned, index) => {
    const capability = input.capabilities.find(
      (item) => item.name === planned.capability,
    );
    if (!capability)
      throw new Error(`Missing native compiler ${planned.capability}`);
    const compiled = capability.compile({
      planned,
      apiNodeNames: names,
      apiResponseContracts,
      position: [600 + index * 250, 300],
    });
    if (
      compiled.nodeId !== planned.id ||
      JSON.stringify(Object.keys(compiled.inputPorts)) !==
        JSON.stringify(capability.inputPorts(planned.parameters)) ||
      JSON.stringify(Object.keys(compiled.outputPorts)) !==
        JSON.stringify(capability.outputPorts(planned.parameters))
    )
      throw new Error(
        `Native compiler ${planned.capability} violated declared node identity/ports`,
      );
    return compiled;
  });
  return nativeNodes;
}
