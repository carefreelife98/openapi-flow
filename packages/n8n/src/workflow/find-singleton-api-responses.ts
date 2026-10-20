import type { CompileNativeWorkflowNodesInput } from '../types/native-capability.js';

/** Prove at-most-one output from the single Manual Trigger item; unknown native streams are not singleton evidence. */
export function findSingletonApiResponses(
  input: CompileNativeWorkflowNodesInput,
): string[] {
  const proven = new Set<string>();
  const pending = input.apiNodes.filter(
    (fragment) => fragment.preservesInputItems === true,
  );
  let changed = true;
  while (pending.length && changed) {
    changed = false;
    for (let index = 0; index < pending.length;) {
      const node = pending[index];
      const incoming = input.plan.edges.filter(
        (edge) => edge.to === node.nodeId,
      );
      const isRoot =
        incoming.length === 0 && input.plan.starts.includes(node.nodeId);
      if (isRoot || (incoming.length === 1 && proven.has(incoming[0].from))) {
        proven.add(node.nodeId);
        pending.splice(index, 1);
        changed = true;
      } else index++;
    }
  }
  return [...proven];
}
