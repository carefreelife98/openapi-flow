import type { NativeOutputContract } from '../../types/node-output.js';

/** Exclude only proven downstream producers; missing lineage never implies independence. */
export function listNativeSourcesDependentOnApi(
  outputs: NativeOutputContract[],
  callId: string,
): Set<string> {
  const consumers = new Map<string, Set<string>>();
  const dependent = new Set<string>();
  const pending: string[] = [];
  for (const output of outputs) {
    for (const reference of output.provenance?.references ?? []) {
      if (reference.source === 'response') {
        if (reference.nodeId === callId && !dependent.has(output.nodeId)) {
          dependent.add(output.nodeId);
          pending.push(output.nodeId);
        }
      } else {
        let nodes = consumers.get(reference.nodeId);
        if (!nodes) {
          nodes = new Set();
          consumers.set(reference.nodeId, nodes);
        }
        nodes.add(output.nodeId);
      }
    }
  }
  while (pending.length) {
    const source = pending.pop()!;
    for (const consumer of consumers.get(source) ?? []) {
      if (dependent.has(consumer)) continue;
      dependent.add(consumer);
      pending.push(consumer);
    }
  }
  return dependent;
}
