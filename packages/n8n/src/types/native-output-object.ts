import type { z } from 'zod';
import type { NativeOutputContract } from '@openapi-flow/core';
import type { nativeOutputObjectParametersSchema } from '../schemas/native-output-object-schema.js';
import type { CompileNativeNodeInput } from './native-capability.js';
export type NativeOutputObjectParameters = z.infer<
  typeof nativeOutputObjectParametersSchema
>;
export interface CompileNativeOutputObjectInput extends CompileNativeNodeInput {
  parameters: NativeOutputObjectParameters;
  sources: NativeOutputContract[];
}
