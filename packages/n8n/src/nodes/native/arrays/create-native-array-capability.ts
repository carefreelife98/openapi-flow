import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type { CreateNativeArrayCapabilityInput } from '../../../types/native-array.js';
import { createBoundNativeArrayCapability } from './create-bound-native-array-capability.js';

/** Existing explicitly named sources remain an immutable binding. New revisions bind contracts separately. */
export function createNativeArrayCapability(
  input: CreateNativeArrayCapabilityInput,
): N8nNativeCapability {
  if (
    !input.sources.length ||
    input.sources.some(
      (source) =>
        typeof source.nodeName !== 'string' || !source.nodeName.trim(),
    )
  )
    throw new Error(
      'native array capability requires sources with compiled names',
    );
  return createBoundNativeArrayCapability({
    sources: input.sources,
    itemMode: input.itemMode,
    runtime: { kind: 'provided', sources: input.sources },
  });
}
