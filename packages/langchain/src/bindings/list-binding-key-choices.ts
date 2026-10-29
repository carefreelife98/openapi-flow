import { isBindingPointerKeyAllowed } from '@openapi-flow/core';
import type { ApiBindingKeyCandidate } from '@openapi-flow/core';
import type { BindingDynamicNameSegment } from '../types/api-binding-model-selection.js';

export function listBindingKeyChoices(
  segment: BindingDynamicNameSegment,
  nodeId: string,
  keys: ApiBindingKeyCandidate[],
): ApiBindingKeyCandidate[] {
  return keys.filter(
    (key) =>
      key.nodeId === nodeId &&
      (segment.kind === 'key'
        ? key.kind === 'key' && isBindingPointerKeyAllowed(segment, key.value)
        : key.kind === 'path'),
  );
}
