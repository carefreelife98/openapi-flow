import type { CreateHttpRequestNodeInput } from '../../../types/node-fragment.js';
import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import { validateNativeOutputContracts } from '@openapi-flow/core';

export function resolveOutputBindingSources(
  input: CreateHttpRequestNodeInput,
): N8nOutputBindingSource[] {
  validateNativeOutputContracts(input.nativeOutputSources ?? []);
  const native = new Map(
    (input.nativeOutputSources ?? []).map((item) => [item.nodeId, item]),
  );
  for (const item of native.values()) {
    if (typeof item.nodeName !== 'string' || !item.nodeName.trim())
      throw new Error(
        `nativeOutputSources[${item.nodeId}].nodeName must be a non-empty string`,
      );
    if (input.apiNodeNames && Object.hasOwn(input.apiNodeNames, item.nodeId))
      throw new Error(
        `binding source ${item.nodeId} is declared as both API and native`,
      );
  }
  return [
    ...new Set(input.arguments.bindings.map((binding) => binding.sourceNodeId)),
  ].map((nodeId) => {
    const source = native.get(nodeId);
    if (source) return { ...source, kind: 'native-json' };
    if (!input.apiNodeNames)
      throw new Error(
        `arguments[${input.arguments.callId}] requires apiNodeNames for API response bindings`,
      );
    if (
      !Object.hasOwn(input.apiNodeNames, nodeId) ||
      !input.apiNodeNames[nodeId].trim()
    )
      throw new Error(`apiNodeNames is missing ${nodeId}`);
    return {
      kind: 'api-response',
      nodeId,
      nodeName: input.apiNodeNames[nodeId],
    };
  });
}
