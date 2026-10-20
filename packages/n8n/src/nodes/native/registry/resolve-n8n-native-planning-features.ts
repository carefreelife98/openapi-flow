import type {
  N8nNativePlanningFeatureRegistry,
  ResolveN8nNativeFeaturesInput,
} from '../../../types/native-feature-registry.js';
import { resolveNativeFeatureRegistry } from './resolve-native-feature-registry.js';

/** Expose stable definitions before API/native producer instances have been planned. */
export function resolveN8nNativePlanningFeatures(
  input: ResolveN8nNativeFeaturesInput = {},
): N8nNativePlanningFeatureRegistry {
  return resolveNativeFeatureRegistry(input, 'planning');
}
