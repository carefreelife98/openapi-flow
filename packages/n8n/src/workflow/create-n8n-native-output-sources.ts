import { createNativeOutputContracts } from '@openapi-flow/core';
import type {
  CreateN8nNativeOutputSourcesInput,
  N8nNativeOutputSource,
} from '../types/output-binding-source.js';

/** Resolve runtime names from the actual SDK producer, not an ID/name guess. */
export function createN8nNativeOutputSources(
  input: CreateN8nNativeOutputSourcesInput,
): N8nNativeOutputSource[] {
  const outputs = createNativeOutputContracts(input);
  return outputs.map((output) => {
    const planned = input.nativeNodes.find(
      (item) => item.id === output.nodeId,
    )!;
    const capability = input.capabilities.find(
      (item) => item.name === planned.capability,
    )!;
    const fragment = capability.compile({
      planned,
      apiNodeNames: input.apiNodeNames,
      position: [600, 300],
    });
    if (fragment.nodeId !== output.nodeId || !fragment.exit.name.trim())
      throw new Error(
        `native output ${output.nodeId} requires its compiled identity/name`,
      );
    return { ...output, nodeName: fragment.exit.name };
  });
}
