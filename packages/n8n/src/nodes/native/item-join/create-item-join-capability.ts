import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type { CreateItemJoinCapabilityInput } from '../../../types/item-join.js';
import { createBoundItemJoinCapability } from './create-bound-item-join-capability.js';

/** Preserve explicitly supplied original runtime names; later revisions bind contracts and SDK names separately. */
export function createItemJoinCapability(
  input: CreateItemJoinCapabilityInput,
): N8nNativeCapability {
  if (
    input.scopes.some(
      (scope) => typeof scope.nodeName !== 'string' || !scope.nodeName.trim(),
    )
  )
    throw new Error(
      'item join scopes require unique non-empty identities and compiled names',
    );
  return createBoundItemJoinCapability({
    ...input,
    runtime: { kind: 'provided', sources: input.scopes },
  });
}
