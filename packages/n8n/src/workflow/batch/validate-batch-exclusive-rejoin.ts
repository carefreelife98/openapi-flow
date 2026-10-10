import type { ValidateBatchItemFlowInput } from '../../types/batch-execution.js';

/** Verify complete one-to-one paths, rather than interpreting item values or IDs. */
export function validateBatchExclusiveRejoin(
  input: ValidateBatchItemFlowInput,
  nodeId: string,
): void {
  const { scope, fragments, edges } = input;
  const sourceId = fragments.get(nodeId)!.rejoinsExclusiveOutputs!;
  const source = fragments.get(sourceId);
  const target = fragments.get(nodeId)!;
  const incoming = edges.filter((edge) => edge.to === nodeId);
  if (
    !scope.nodeIds.includes(sourceId) ||
    !source?.partitionsInputItems ||
    target.preservesInputItems ||
    target.joinsInputItemsByAncestry ||
    Object.keys(target.outputPorts).join() !== 'main' ||
    target.inputEndpoints ||
    incoming.length !== Object.keys(target.inputPorts).length
  )
    throw new Error(
      `batch ${scope.id}: rejoin ${nodeId} requires a complete partition in the same scope`,
    );
  const covered = new Set<string>();
  for (const port of Object.keys(target.inputPorts)) {
    const paths = incoming.filter((edge) => edge.input === port);
    if (paths.length !== 1)
      throw new Error(
        `batch ${scope.id}: rejoin ${nodeId} requires exactly one path per input`,
      );
    let edge = paths[0];
    const visited = new Set<string>();
    while (edge.from !== sourceId) {
      const step = fragments.get(edge.from);
      const predecessors = edges.filter((item) => item.to === edge.from);
      if (
        !scope.nodeIds.includes(edge.from) ||
        visited.has(edge.from) ||
        !step ||
        step.preservesInputItems !== true ||
        step.joinsInputItemsByAncestry ||
        step.partitionsInputItems ||
        step.rejoinsExclusiveOutputs ||
        step.inputEndpoints ||
        Object.keys(step.inputPorts).join() !== 'main' ||
        Object.keys(step.outputPorts).join() !== 'main' ||
        predecessors.length !== 1 ||
        edges.filter((item) => item.from === edge.from).length !== 1
      )
        throw new Error(
          `batch ${scope.id}: rejoin ${nodeId} requires item-preserving paths from ${sourceId}`,
        );
      visited.add(edge.from);
      edge = predecessors[0];
    }
    if (
      !Object.hasOwn(source.outputPorts, edge.output) ||
      covered.has(edge.output)
    )
      throw new Error(
        `batch ${scope.id}: rejoin ${nodeId} repeats or omits an alternative of ${sourceId}`,
      );
    covered.add(edge.output);
  }
  if (covered.size !== Object.keys(source.outputPorts).length)
    throw new Error(
      `batch ${scope.id}: rejoin ${nodeId} must return every alternative of ${sourceId}`,
    );
}
