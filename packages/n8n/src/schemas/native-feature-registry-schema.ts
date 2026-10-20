import { z } from 'zod';
import { N8nNativeFeature } from '../types/native-feature-registry.js';

export const n8nNativeFeatureSelectionSchema = z
  .array(z.enum(N8nNativeFeature))
  .refine(
    (features) => new Set(features).size === features.length,
    'features must be unique',
  );

export const nativeItemExecutionOptionsSchema = z.strictObject({
  itemMode: z.literal('linked').optional(),
});
