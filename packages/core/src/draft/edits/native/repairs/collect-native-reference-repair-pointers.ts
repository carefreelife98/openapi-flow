import type { WorkflowNativeReferenceBinding } from '../../../../types/native-parameter-reference.js';

/** A shared physical setting couples every declared reference using that setting. */
export function collectNativeReferenceRepairPointers(
  bindings: WorkflowNativeReferenceBinding[],
  changedValueSources: ReadonlySet<string>,
  changedControlSources: ReadonlySet<string>,
): string[] {
  const pointers = new Set<string>();
  const locations = (binding: WorkflowNativeReferenceBinding): string[] => [
    binding.nodeIdPointer,
    ...(binding.valuePointer === undefined ? [] : [binding.valuePointer]),
  ];
  for (const binding of bindings)
    if (
      (binding.reference.source === 'exclusive-output'
        ? changedControlSources
        : changedValueSources
      ).has(binding.reference.nodeId)
    )
      for (const pointer of locations(binding)) pointers.add(pointer);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const binding of bindings) {
      const shared = locations(binding);
      if (!shared.some((pointer) => pointers.has(pointer))) continue;
      for (const pointer of shared)
        if (!pointers.has(pointer)) {
          pointers.add(pointer);
          expanded = true;
        }
    }
  }
  return [...pointers].sort();
}
