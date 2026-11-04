import type { z } from 'zod';
import type { nativeParameterValuePolicySchema } from '../schemas/native-parameter-value-policy-schema.js';

export type NativeParameterValuePolicy = z.infer<
  typeof nativeParameterValuePolicySchema
>;
