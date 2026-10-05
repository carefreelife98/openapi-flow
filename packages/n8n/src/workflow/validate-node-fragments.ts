import type { N8nNodeFragment } from '../types/node-fragment.js';

/** Internal implementation nodes must form one connected entry-to-exit DAG. */
export function validateNodeFragments(fragments: N8nNodeFragment[]): void {
  for (const fragment of fragments) {
    const byId = new Map(fragment.nodes.map((item) => [item.id, item]));
    if (
      !fragment.nodes.includes(fragment.entry) ||
      !fragment.nodes.includes(fragment.exit) ||
      byId.size !== fragment.nodes.length
    )
      throw new Error(
        `node fragment ${fragment.nodeId} has invalid entry/exit or duplicate IDs`,
      );
    const edges = fragment.internalEdges ?? [];
    const keys = new Set<string>();
    for (const edge of edges) {
      const key = JSON.stringify(edge);
      if (
        !byId.has(edge.from) ||
        !byId.has(edge.to) ||
        keys.has(key) ||
        !Number.isInteger(edge.output) ||
        edge.output < 0 ||
        !Number.isInteger(edge.input) ||
        edge.input < 0
      )
        throw new Error(
          `node fragment ${fragment.nodeId} has an invalid internal edge`,
        );
      keys.add(key);
    }
    const reached = new Set<string>();
    const active = new Set<string>();
    function visit(id: string): void {
      if (active.has(id))
        throw new Error(
          `node fragment ${fragment.nodeId} has an internal cycle`,
        );
      if (reached.has(id)) return;
      active.add(id);
      for (const edge of edges.filter((item) => item.from === id))
        visit(edge.to);
      active.delete(id);
      reached.add(id);
    }
    visit(fragment.entry.id);
    if (
      reached.size !== byId.size ||
      edges.some(
        (edge) =>
          edge.to === fragment.entry.id || edge.from === fragment.exit.id,
      ) ||
      fragment.nodes.some(
        (item) =>
          item !== fragment.exit &&
          !edges.some((edge) => edge.from === item.id),
      )
    )
      throw new Error(
        `node fragment ${fragment.nodeId} must connect every internal node from entry to exit`,
      );
  }
}
