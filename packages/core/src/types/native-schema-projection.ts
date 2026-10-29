import type { NativeOutputContract } from './node-output.js';

export type NativeSchemaProjectionStep =
  | { kind: 'value'; pointer: string }
  | { kind: 'array-items' }
  | { kind: 'object-entries' }
  | { kind: 'require-array' };

export interface ProjectNativeValueSchemaInput {
  output: NativeOutputContract;
  steps: NativeSchemaProjectionStep[];
}
