import type {
  CompileNativeNodeInput,
  NativeCheck,
} from './native-capability.js';
import type { N8nOutputBindingSource } from './output-binding-source.js';

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
