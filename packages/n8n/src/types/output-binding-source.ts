import type { NativeOutputContract } from '@openapi-flow/core';
import type { PlannedNativeNode } from '@openapi-flow/core';
import type { N8nNativeCapability } from './native-capability.js';

export interface N8nNativeOutputSource extends NativeOutputContract {
  nodeName: string;
}

export interface N8nApiResponseSource {
  kind: 'api-response';
  nodeId: string;
  nodeName: string;
}

export interface N8nNativeJsonSource extends N8nNativeOutputSource {
  kind: 'native-json';
}

export type N8nOutputBindingSource = N8nApiResponseSource | N8nNativeJsonSource;

export interface CreateN8nNativeOutputSourcesInput {
  nativeNodes: PlannedNativeNode[];
  capabilities: N8nNativeCapability[];
  apiNodeNames: Record<string, string>;
}
