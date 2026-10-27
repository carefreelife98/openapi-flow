import type { ApiBindingMaterial } from '@openapi-flow/core';
import type { z } from 'zod';
import type {
  apiResponseMapEntryParametersSchema,
  apiResponseMapEntryStructureSchema,
} from '../schemas/api-response-map-entry-schema.js';
import type {
  NativeItemExecutionOptions,
  CompileNativeNodeInput,
} from './native-capability.js';

export type ApiResponseMapEntryParameters = z.infer<
  typeof apiResponseMapEntryParametersSchema
>;
export interface CreateApiResponseMapEntryCapabilityInput extends NativeItemExecutionOptions {
  materials: ApiBindingMaterial[];
}
export type ApiResponseMapEntryStructure = z.infer<
  typeof apiResponseMapEntryStructureSchema
>;
export interface CompileApiResponseMapEntryInput extends CompileNativeNodeInput {
  parameters: ApiResponseMapEntryStructure;
  material: ApiBindingMaterial;
  linked: boolean;
}
