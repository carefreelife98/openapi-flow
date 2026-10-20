import { validateNativeOutputContracts } from '@openapi-flow/core';
import type { ResolveN8nNativeFeaturesInput } from '../../../types/native-feature-registry.js';
import { nativeItemExecutionOptionsSchema } from '../../../schemas/native-feature-registry-schema.js';

export function validateNativeFeatureContext(
  input: ResolveN8nNativeFeaturesInput,
): void {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('native features input must be an object');
  const execution = nativeItemExecutionOptionsSchema.safeParse({
    itemMode: input.itemMode,
  });
  if (!execution.success)
    throw new Error('native features.itemMode must be linked or omitted', {
      cause: execution.error,
    });
  if (input.apiMaterials !== undefined) {
    if (!Array.isArray(input.apiMaterials))
      throw new Error('native features.apiMaterials must be an array');
    const ids = new Set<string>();
    for (const material of input.apiMaterials) {
      if (
        !material ||
        typeof material.callId !== 'string' ||
        !material.callId.trim() ||
        ids.has(material.callId) ||
        !material.operation ||
        material.operation.source !== 'paths'
      )
        throw new Error(
          'native features.apiMaterials requires unique callIds and resolved OAS operation contracts',
        );
      ids.add(material.callId);
    }
  }
  if (input.nativeOutputSources !== undefined) {
    validateNativeOutputContracts(input.nativeOutputSources);
    if (
      input.nativeOutputSources.some(
        (source) =>
          typeof source.nodeName !== 'string' || !source.nodeName.trim(),
      )
    )
      throw new Error(
        'native features.nativeOutputSources requires actual compiled nodeName values',
      );
  }
  if (input.jsonOutput !== undefined) {
    const output = input.jsonOutput;
    if (
      !output ||
      typeof output.name !== 'string' ||
      !output.name.trim() ||
      typeof output.description !== 'string' ||
      !output.description.trim() ||
      !output.parametersSchema ||
      typeof output.parametersSchema.safeParse !== 'function'
    )
      throw new Error(
        'native features.jsonOutput requires name, description and a Zod parametersSchema',
      );
  }
  if (input.extensions !== undefined && !Array.isArray(input.extensions))
    throw new Error('native features.extensions must be an array');
}
