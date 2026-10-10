import type { z } from 'zod';
import type { nativeArrayParametersSchema } from '../schemas/native-array-schema.js';
import type { N8nNativeOutputSource } from './output-binding-source.js';
import type { NativeItemExecutionOptions } from './native-capability.js';

export type NativeArrayParameters = z.infer<typeof nativeArrayParametersSchema>;
export interface CreateNativeArrayCapabilityInput extends NativeItemExecutionOptions {
  sources: N8nNativeOutputSource[];
}
