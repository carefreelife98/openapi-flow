import { z } from 'zod';
import type { N8nNativeInputConfiguration } from '../types/native-runtime-parameters.js';

export const n8nNativeInputConfigurationSchema = z.strictObject({
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  inputValues: z.record(z.string(), z.json()).optional(),
}) satisfies z.ZodType<N8nNativeInputConfiguration>;
