import type { z } from 'zod';
import type { ApiBindingMaterial, BindingSchema } from '@openapi-flow/core';
import type { apiResponseKeyJoinParametersSchema } from '../schemas/api-response-key-join-schema.js';
import type { CompileNativeNodeInput } from './native-capability.js';
import type { N8nOutputBindingSource } from './output-binding-source.js';

export type ApiResponseKeyJoinParameters = z.infer<
  typeof apiResponseKeyJoinParametersSchema
>;
export type ApiResponseKeyJoinSource = ApiResponseKeyJoinParameters['left'];
export interface CreateApiResponseKeyJoinCapabilityInput {
  materials: ApiBindingMaterial[];
}
export interface ApiResponseKeyJoinContract {
  material: ApiBindingMaterial;
  itemSchema: BindingSchema;
  keySchema: BindingSchema;
}
export interface CompileApiResponseKeyJoinInput extends CompileNativeNodeInput {
  parameters: ApiResponseKeyJoinParameters;
  left: ApiResponseKeyJoinContract;
  right: ApiResponseKeyJoinContract;
}
export interface CreateKeyJoinReaderCodeInput {
  source: N8nOutputBindingSource;
  selection: ApiResponseKeyJoinSource;
  side: 'left' | 'right';
  missingKeys: ApiResponseKeyJoinParameters['missingKeys'];
}
