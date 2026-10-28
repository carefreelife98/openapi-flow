import type {
  CompileNativeNodeInput,
  NativeCheck,
} from './native-capability.js';
import type { N8nOutputBindingSource } from './output-binding-source.js';
import type { WorkflowValueReference } from '@openapi-flow/core';

export interface CreateComparisonInputReaderInput extends Pick<
  CompileNativeNodeInput,
  | 'apiNodeNames'
  | 'apiResponseContracts'
  | 'singletonApiResponseIds'
  | 'nativeOutputSources'
> {
  nodeId: string;
  checks: NativeCheck[];
  linked: boolean;
}

export interface CompiledComparisonInputReader {
  code: string;
  bindingSources: N8nOutputBindingSource[];
}

export interface CreateComparisonSourceReaderInput extends Omit<
  CreateComparisonInputReaderInput,
  'checks'
> {
  references: WorkflowValueReference[];
}
