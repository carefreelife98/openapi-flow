import type { NativeOutputContract } from '@openapi-flow/core';
import type { z } from 'zod';
import type { nativeValueCollectionParametersSchema } from '../schemas/native-value-collection-schema.js';
import type { CompileNativeNodeInput } from './native-capability.js';
import type { N8nOutputBindingSource } from './output-binding-source.js';

export type NativeValueCollectionParameters = z.infer<
  typeof nativeValueCollectionParametersSchema
>;

export interface CreateNativeValueCollectionCapabilityInput {
  sources: NativeOutputContract[];
}

export interface CompileValueCollectionFragmentInput extends Pick<
  CompileNativeNodeInput,
  'planned' | 'position'
> {
  source: N8nOutputBindingSource;
  pointer: string;
}
