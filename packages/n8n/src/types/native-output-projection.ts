import type { z } from 'zod';
import type { NativeOutputContract } from '@openapi-flow/core';
import type { nativeOutputProjectionParametersSchema } from '../schemas/native-output-projection-schema.js';
import type { CompileNativeNodeInput } from './native-capability.js';
import type { N8nNativeOutputSource } from './output-binding-source.js';

export type NativeOutputProjectionParameters = z.infer<
  typeof nativeOutputProjectionParametersSchema
>;
export type NativeOutputProjectionField =
  NativeOutputProjectionParameters['fields'][number];

export interface CreateNativeOutputProjectionCapabilityInput {
  sources: NativeOutputContract[];
}

export interface CompileNativeOutputProjectionInput extends CompileNativeNodeInput {
  source: N8nNativeOutputSource;
  parameters: NativeOutputProjectionParameters;
}
