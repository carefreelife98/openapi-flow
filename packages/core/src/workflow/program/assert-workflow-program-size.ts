import type { WorkflowProgramLimits } from '../../types/workflow-execution-program.js';

/** Bound untrusted recursive data before invoking the recursive runtime schema. Shared JSON values are allowed; cycles are not. */
export function assertWorkflowProgramSize(
  value: unknown,
  limits: WorkflowProgramLimits,
): void {
  const pending = [{ value, depth: 0, exiting: false }];
  const active = new Set<object>();
  const maximum = limits.maxBlocks * 8 + 8;
  let count = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (entry.exiting) {
      if (entry.value !== null && typeof entry.value === 'object')
        active.delete(entry.value);
      continue;
    }
    if (++count > maximum)
      throw new Error('Execution program exceeds maxBlocks');
    if (entry.value === null || typeof entry.value !== 'object') continue;
    if (active.has(entry.value))
      throw new Error('Execution program contains cyclic objects');
    if (entry.depth > limits.maxDepth * 4 + 4)
      throw new Error('Execution program exceeds maxDepth');
    if (Array.isArray(entry.value) && entry.value.length > maximum)
      throw new Error('Execution program exceeds maxBlocks');
    const children = Object.values(entry.value);
    if (count + pending.length + children.length > maximum * 2)
      throw new Error('Execution program exceeds maxBlocks');
    active.add(entry.value);
    pending.push({ ...entry, exiting: true });
    for (const child of children)
      pending.push({ value: child, depth: entry.depth + 1, exiting: false });
  }
}
