import type { NativeInstanceDependencyProposal } from '../../types/native-instance-dependencies.js';

/** Selected roles must form a planning DAG. Existing external contracts do not become generated roles. */
export function validateNativeProducerDependencyGraph(
  nodeIds: string[],
  proposal: NativeInstanceDependencyProposal,
): void {
  const remaining = new Map(
    nodeIds.map((nodeId) => [
      nodeId,
      new Set(
        proposal.sourcesByNodeId[nodeId].sourceNodeIds.filter((id) =>
          nodeIds.includes(id),
        ),
      ),
    ]),
  );
  while (remaining.size) {
    const ready = [...remaining]
      .filter(([, sources]) => sources.size === 0)
      .map(([id]) => id);
    if (!ready.length)
      throw new Error(
        'Native producer dependency cycle: ' + [...remaining.keys()].join(', '),
      );
    for (const id of ready) remaining.delete(id);
    for (const sources of remaining.values())
      for (const id of ready) sources.delete(id);
  }
}
