import type {
  CompileNativeNodeInput,
  NativeCheck,
} from './native-capability.js';
import type { N8nApiResponseSource } from './output-binding-source.js';

export interface CreateResponseCheckReaderInput extends Pick<
  CompileNativeNodeInput,
  'apiNodeNames' | 'apiResponseContracts'
> {
  nodeId: string;
  checks: NativeCheck[];
  linked: boolean;
}

export interface CompiledResponseCheckReader {
  code: string;
  bindingSources: N8nApiResponseSource[];
}
