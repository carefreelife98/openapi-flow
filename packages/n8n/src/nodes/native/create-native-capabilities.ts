import { resolveN8nNativeFeatures } from './registry/resolve-n8n-native-features.js';
import { validateNativeFeatureContext } from './registry/validate-native-feature-context.js';
import { N8nNativeFeature } from '../../types/native-feature-registry.js';
import type {
  N8nNativeCapability,
  NativeItemExecutionOptions,
} from '../../types/native-capability.js';

export function createN8nNativeCapabilities(
  input: NativeItemExecutionOptions = {},
): N8nNativeCapability[] {
  validateNativeFeatureContext(input);
  return resolveN8nNativeFeatures({
    ...input,
    features: [
      N8nNativeFeature.If,
      N8nNativeFeature.MergeAppend,
      N8nNativeFeature.AssertResponses,
      N8nNativeFeature.StopAndError,
    ],
  }).capabilities;
}
