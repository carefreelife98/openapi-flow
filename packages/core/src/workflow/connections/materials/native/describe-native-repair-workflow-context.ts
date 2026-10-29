import type { WorkflowConnectionSessionDescription } from '../../../../types/workflow-connection-session.js';
import type {
  WorkflowConnectionNativeWorkflowContext,
  WorkflowConnectionNativeNodePorts,
} from '../../../../types/workflow-connection-native-repair.js';

/** Read the validated source inventory without widening checked value-reference scopes. */
export function describeNativeRepairWorkflowContext(
  description: WorkflowConnectionSessionDescription,
): WorkflowConnectionNativeWorkflowContext {
  const { context, input } = description.source;
  function ports(id: string): WorkflowConnectionNativeNodePorts {
    const node = context.nodes.find((entry) => entry.id === id);
    if (!node)
      throw new Error(
        `Native repair workflow context lacks node contract ${id}`,
      );
    return {
      id: node.id,
      inputs: node.inputs,
      outputs: node.outputs,
      waitsForAllInputs: node.waitsForAllInputs,
      exclusiveOutputPorts: node.exclusiveOutputPorts,
    };
  }
  return structuredClone({
    ...(context.entrypoint === undefined
      ? {}
      : { entrypoint: context.entrypoint }),
    edges: context.edges,
    gaps: context.gaps,
    apiNodes: description.apiOperations.map(({ nodeId, ...operation }) => ({
      ...ports(nodeId),
      ...operation,
    })),
    nativeNodes: input.nativeNodes.map((node) => {
      const capability = input.capabilities.find(
        (entry) => entry.name === node.capability,
      );
      if (!capability)
        throw new Error(
          `Native repair workflow context lacks capability ${node.capability}`,
        );
      return {
        ...ports(node.id),
        capability: node.capability,
        description: capability.description,
      };
    }),
  });
}
