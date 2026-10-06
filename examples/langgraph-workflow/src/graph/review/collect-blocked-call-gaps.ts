import type { CollectBlockedCallGapsInput } from '../../types/workflow-review.js';

export function collectBlockedCallGaps({
  materials,
  bindingPlan,
  selectionGaps,
  bindingGaps,
}: CollectBlockedCallGapsInput): Map<string, Set<string>> {
  const blocked = new Map<string, Set<string>>();
  for (const material of materials) {
    const key = material.operation.key;
    const causal = selectionGaps
      .filter(
        (gap) =>
          gap.operation?.documentId === key.documentId &&
          gap.operation.snapshotId === key.snapshotId &&
          gap.operation.operationRef === key.operationRef,
      )
      .map((gap) => gap.id);
    for (const [index, gap] of bindingPlan.gaps.entries()) {
      if (gap.callId !== material.callId) continue;
      const diagnostic = bindingGaps[index];
      if (!diagnostic)
        throw new Error(
          `binding gap ${material.callId} has no review diagnostic`,
        );
      causal.push(diagnostic.id);
    }
    if (causal.length) blocked.set(material.callId, new Set(causal));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const call of bindingPlan.calls) {
      const inherited = new Set<string>();
      for (const binding of call.bindings) {
        const source = blocked.get(binding.sourceNodeId);
        if (source) for (const id of source) inherited.add(id);
      }
      if (!inherited.size) continue;
      const previous = blocked.get(call.callId);
      if (previous) for (const id of previous) inherited.add(id);
      if (!previous || inherited.size !== previous.size) {
        blocked.set(call.callId, inherited);
        changed = true;
      }
    }
  }
  return blocked;
}
