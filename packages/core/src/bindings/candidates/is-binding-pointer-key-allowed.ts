import type { BindingPointerKeySegment } from '../../types/api-binding-candidates.js';

/** Original schema key constraints shared by manual resolution and model choices. */
export function isBindingPointerKeyAllowed(
  segment: BindingPointerKeySegment,
  value: string,
): boolean {
  return (
    !segment.excludedKeys?.includes(value) &&
    !segment.excludedPatterns?.some((pattern) =>
      new RegExp(pattern).test(value),
    ) &&
    (segment.pattern === undefined || new RegExp(segment.pattern).test(value))
  );
}
