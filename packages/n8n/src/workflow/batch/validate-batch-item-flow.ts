import type { ValidateBatchItemFlowInput } from '../../types/batch-execution.js';

/** Prove one result per entry item through declared preservation and ancestry joins. */
export function validateBatchItemFlow({
  scope,
  fragments,
  edges,
  otherBatchNodeIds,
}: ValidateBatchItemFlowInput): void {
  const members = new Set(scope.nodeIds);
  const incoming = (id: string) => edges.filter((edge) => edge.to === id);
  const outgoing = (id: string) => edges.filter((edge) => edge.from === id);
  const upstream = incoming(scope.entryNodeId).filter(
    (edge) => !members.has(edge.from),
  );
  if (upstream.length > 1)
    throw new Error(`batch ${scope.id}: entry requires one upstream stream`);
  const entryAncestors = new Set<string>();
  let preceding = upstream.map((edge) => edge.from);
  while (preceding.length) {
    const id = preceding.pop()!;
    if (otherBatchNodeIds.has(id)) break;
    if (entryAncestors.has(id))
      throw new Error(`batch ${scope.id}: upstream item flow has a cycle`);
    entryAncestors.add(id);
    const fragment = fragments.get(id)!;
    const sources = incoming(id);
    if (
      fragment.preservesInputItems === true &&
      !fragment.joinsInputItemsByAncestry &&
      Object.keys(fragment.inputPorts).join() === 'main' &&
      Object.keys(fragment.outputPorts).join() === 'main' &&
      !fragment.inputEndpoints &&
      sources.length === 1
    )
      preceding = [sources[0].from];
  }
  const ancestors = new Map<string, Set<string>>();
  const pending = [...members];
  while (pending.length) {
    const index = pending.findIndex((id) =>
      incoming(id)
        .filter((edge) => members.has(edge.from))
        .every((edge) => ancestors.has(edge.from)),
    );
    if (index === -1)
      throw new Error(`batch ${scope.id}: item flow has a cycle`);
    const id = pending.splice(index, 1)[0];
    const fragment = fragments.get(id)!;
    const innerIncoming = incoming(id).filter((edge) => members.has(edge.from));
    const innerOutgoing = outgoing(id).filter((edge) => members.has(edge.to));
    if (
      (id === scope.entryNodeId
        ? innerIncoming.length !== 0
        : innerIncoming.length === 0) ||
      (id === scope.exitNodeId
        ? innerOutgoing.length !== 0
        : innerOutgoing.length === 0)
    )
      throw new Error(
        `batch ${scope.id}: every member must lie between its entry and exit`,
      );
    const join = fragment.joinsInputItemsByAncestry;
    if (
      Object.keys(fragment.outputPorts).join() !== 'main' ||
      (!join &&
        (fragment.preservesInputItems !== true ||
          Object.keys(fragment.inputPorts).join() !== 'main' ||
          fragment.inputEndpoints)) ||
      (join && fragment.preservesInputItems === true)
    )
      throw new Error(
        `batch ${scope.id}: member ${id} requires an item-preserving main path contract or an explicit ancestry join`,
      );
    let inherited: Set<string>;
    if (join) {
      const ports = Object.keys(fragment.inputPorts);
      if (
        id === scope.entryNodeId ||
        ports.length < 2 ||
        ports.some(
          (port) =>
            innerIncoming.filter((edge) => edge.input === port).length !== 1,
        ) ||
        innerIncoming.length !== ports.length
      )
        throw new Error(
          `batch ${scope.id}: join ${id} requires exactly one branch per declared input`,
        );
      const branchAncestors = innerIncoming.map((edge) =>
        ancestors.get(edge.from)!,
      );
      if (
        !fragment.bindingSources?.some(
          (source) =>
            source.kind === 'native-json' && source.nodeId === join.scopeNodeId,
        ) ||
        branchAncestors.some((branch) => !branch.has(join.scopeNodeId))
      )
        throw new Error(
          `batch ${scope.id}: join ${id} scope ${join.scopeNodeId} must identify each entry item on every branch`,
        );
      inherited = new Set(
        [...branchAncestors[0]].filter((ancestor) =>
          branchAncestors.every((branch) => branch.has(ancestor)),
        ),
      );
    } else {
      if (id !== scope.entryNodeId && innerIncoming.length !== 1)
        throw new Error(
          `batch ${scope.id}: member ${id} requires one incoming item stream; use an explicit ancestry join for branches`,
        );
      inherited =
        id === scope.entryNodeId
          ? entryAncestors
          : ancestors.get(innerIncoming[0].from)!;
    }
    ancestors.set(id, new Set([...inherited, id]));
  }
}
