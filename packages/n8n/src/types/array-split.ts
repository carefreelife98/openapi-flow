import type { PlannedNativeNode } from '@openapi-flow/core';
import type { N8nOutputBindingSource } from './output-binding-source.js';

export interface ArraySplitParameters {
  sourceNodeId: string;
  pointer: string;
}

export interface CreateArrayNodeFragmentInput {
  planned: PlannedNativeNode;
  position: [number, number];
  source: N8nOutputBindingSource;
  parameters: ArraySplitParameters;
  linked: boolean;
}
