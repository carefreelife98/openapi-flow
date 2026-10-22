import type { z } from 'zod';
import type { ApiBindingMaterial } from '@openapi-flow/core';
import type { apiResponseObjectParametersSchema } from '../schemas/api-response-object-schema.js';
import type { CompileNativeNodeInput } from './native-capability.js';

export type ApiResponseObjectParameters = z.infer<
  typeof apiResponseObjectParametersSchema
>;
export interface CreateApiResponseObjectCapabilityInput {
  materials: ApiBindingMaterial[];
}
export interface CompileApiResponseObjectInput extends CompileNativeNodeInput {
  parameters: ApiResponseObjectParameters;
  materials: ApiBindingMaterial[];
}
