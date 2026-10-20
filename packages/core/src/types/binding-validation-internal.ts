import type { ApiBindingMaterial } from './api-bindings.js';
import type { NativeOutputContract } from './node-output.js';
import type { OutputBinding } from './api-arguments.js';

export interface ApiBindingSourceRegistry {
  api: Map<string, ApiBindingMaterial>;
  native: Map<string, NativeOutputContract>;
}
export interface ValidateRegisteredApiBindingInput {
  callId: string;
  binding: OutputBinding;
  registry: ApiBindingSourceRegistry;
}
