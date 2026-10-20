import type {
  N8nNativeFeatureRegistry,
  ResolveN8nNativeFeaturesInput,
} from '../../../types/native-feature-registry.js';
import { resolveNativeFeatureRegistry } from './resolve-native-feature-registry.js';

/** Construct capabilities only from already supplied source contracts. */
export function resolveN8nNativeFeatures(
  input: ResolveN8nNativeFeaturesInput = {},
): N8nNativeFeatureRegistry {
  const { registrations, capabilities } = resolveNativeFeatureRegistry(
    input,
    'materials',
  );
  return { registrations, capabilities };
}
