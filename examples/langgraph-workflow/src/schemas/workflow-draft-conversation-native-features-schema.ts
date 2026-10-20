import { z } from 'zod';
import { N8nNativeFeature } from '@openapi-flow/n8n';
import type { CreateJsonOutputCapabilityInput } from '@openapi-flow/n8n';

export const draftConversationNativeFeatureOptionsSchema = z.strictObject({
  features: z.array(z.enum(N8nNativeFeature)).optional(),
  jsonOutput: z.custom<CreateJsonOutputCapabilityInput>().optional(),
});
