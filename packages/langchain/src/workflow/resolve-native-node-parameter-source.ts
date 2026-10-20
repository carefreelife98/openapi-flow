import type { PlannedNativeNode } from '@openapi-flow/core';
import type { NativeNodeModelInstance } from '../types/native-node-planning.js';

/** Runtime flags and empty execution parameters are code-owned, never inferred from placeholder text. */
export function resolveNativeNodeParameterSource(
  node: NativeNodeModelInstance,
): PlannedNativeNode {
  const identity = { id: node.id, capability: node.capability };
  if ('parameterSource' in node && node.parameterSource === 'workflow-input')
    return { ...identity, parameters: {}, runtimeParameters: true };
  return { ...identity, parameters: node.parameters };
}
