import type { z } from 'zod';
import type {
  ApiBindingMaterial,
  ApiOperationContract,
  JsonValue,
} from '@openapi-flow/core';
import type { apiResponseResultsParametersSchema } from '../schemas/api-response-results-schema.js';
import type { CompileNativeNodeInput } from './native-capability.js';

export type ApiResponseResultsParameters = z.infer<
  typeof apiResponseResultsParametersSchema
>;
export interface CreateApiResponseResultsCapabilityInput {
  materials: ApiBindingMaterial[];
}
/** Fixed library-owned envelope; body retains the complete original OAS response value. */
export interface ApiResponseResult {
  callId: ApiBindingMaterial['callId'];
  documentId: ApiOperationContract['key']['documentId'];
  method: ApiOperationContract['method'];
  path: ApiOperationContract['path'];
  body: JsonValue;
}
export interface ApiResponseResultsOutput {
  results: ApiResponseResult[];
}
export interface CompileApiResponseResultsInput extends CompileNativeNodeInput {
  parameters: ApiResponseResultsParameters;
  materials: ApiBindingMaterial[];
}
