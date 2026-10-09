import type { ApiBindingMaterial } from '@openapi-flow/core';
import type { z } from 'zod';
import type { responseArrayParametersSchema } from '../schemas/response-array-schema.js';
import type { NativeItemExecutionOptions } from './native-capability.js';

export type ResponseArrayParameters = z.infer<
  typeof responseArrayParametersSchema
>;
export interface CreateResponseArrayCapabilityInput extends NativeItemExecutionOptions {
  materials: ApiBindingMaterial[];
}
