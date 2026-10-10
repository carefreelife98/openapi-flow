import { node } from '@n8n/workflow-sdk';
import type {
  CreateBatchExecutionScopesInput,
  CompiledN8nBatchExecutionScope,
} from '../../types/batch-execution.js';
import { batchExecutionScopesSchema } from '../../schemas/batch-execution-schema.js';

/** Lower explicitly bounded, cardinality-preserving paths; never allow arbitrary cycles. */
export function createBatchExecutionScopes(
  input: CreateBatchExecutionScopesInput,
): CompiledN8nBatchExecutionScope[] {
  const scopes = batchExecutionScopesSchema.parse(input.batchScopes);
  const fragments = new Map(
    input.nodes.map((fragment) => [fragment.nodeId, fragment]),
  );
  const owners = new Set<string>();
  const ids = new Set<string>();
  return scopes.map((scope) => {
    const members = new Set(scope.nodeIds);
    if (
      ids.has(scope.id) ||
      members.size !== scope.nodeIds.length ||
      !members.has(scope.entryNodeId) ||
      !members.has(scope.exitNodeId)
    )
      throw new Error(
        `batch ${scope.id}: duplicate scope/member identity or missing entry/exit member`,
      );
    ids.add(scope.id);
    for (const id of members) {
      const fragment = fragments.get(id);
      if (!fragment || owners.has(id))
        throw new Error(
          `batch ${scope.id}: missing or overlapping member ${id}`,
        );
      owners.add(id);
      if (
        fragment.preservesInputItems !== true ||
        Object.keys(fragment.inputPorts).join() !== 'main' ||
        Object.keys(fragment.outputPorts).join() !== 'main' ||
        fragment.inputEndpoints
      )
        throw new Error(
          `batch ${scope.id}: member ${id} requires a one-input/one-output item-preserving main path contract`,
        );
      const incoming = input.edges.filter((edge) => edge.to === id);
      const outgoing = input.edges.filter((edge) => edge.from === id);
      if (
        incoming.some(
          (edge) => !members.has(edge.from) && id !== scope.entryNodeId,
        ) ||
        outgoing.some(
          (edge) => !members.has(edge.to) && id !== scope.exitNodeId,
        )
      )
        throw new Error(
          `batch ${scope.id}: member ${id} crosses the entry/exit boundary`,
        );
      const innerIncoming = incoming.filter((edge) => members.has(edge.from));
      const innerOutgoing = outgoing.filter((edge) => members.has(edge.to));
      if (
        innerIncoming.length !== (id === scope.entryNodeId ? 0 : 1) ||
        innerOutgoing.length !== (id === scope.exitNodeId ? 0 : 1)
      )
        throw new Error(
          `batch ${scope.id}: members must form a single entry-to-exit path`,
        );
      if (id === scope.entryNodeId && incoming.length > 1)
        throw new Error(
          `batch ${scope.id}: entry requires one upstream stream`,
        );
      if (id !== scope.entryNodeId && input.starts.includes(id))
        throw new Error(
          `batch ${scope.id}: only its entry may be a workflow start`,
        );
    }
    const entry = fragments.get(scope.entryNodeId)!;
    const position = entry.entry.config.position;
    if (
      !Array.isArray(position) ||
      position.length !== 2 ||
      position.some(
        (coordinate) =>
          typeof coordinate !== 'number' || !Number.isFinite(coordinate),
      )
    )
      throw new Error(
        `batch ${scope.id}: entry ${scope.entryNodeId} requires config.position with two finite coordinates`,
      );
    return {
      scope,
      controller: node({
        type: 'n8n-nodes-base.splitInBatches',
        version: 3,
        config: {
          id: scope.id,
          name: scope.id,
          position: [position[0] - 220, position[1]],
          parameters: { batchSize: scope.batchSize, options: { reset: false } },
        },
      }),
    };
  });
}
