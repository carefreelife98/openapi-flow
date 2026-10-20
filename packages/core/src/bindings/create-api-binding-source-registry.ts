import type { ValidateApiBindingAssignmentInput } from '../types/api-bindings.js';
import type { ApiBindingSourceRegistry } from '../types/binding-validation-internal.js';
import { validateNativeOutputContracts } from './validate-native-output-contracts.js';

export function createApiBindingSourceRegistry(
  input: Pick<ValidateApiBindingAssignmentInput, 'materials' | 'nativeOutputs'>,
): ApiBindingSourceRegistry {
  if (!Array.isArray(input.materials))
    throw new Error('binding materials must be an array');
  if (
    !input.materials.length ||
    input.materials.some(
      (item) => !item || typeof item.callId !== 'string' || !item.callId.trim(),
    )
  )
    throw new Error('binding materials require unique non-empty callIds');
  const api = new Map(
    input.materials.map((material) => [material.callId, material]),
  );
  if (api.size !== input.materials.length)
    throw new Error('binding materials require unique non-empty callIds');
  const outputs = input.nativeOutputs === undefined ? [] : input.nativeOutputs;
  validateNativeOutputContracts(outputs);
  const native = new Map(outputs.map((item) => [item.nodeId, item]));
  for (const output of outputs)
    if (api.has(output.nodeId))
      throw new Error(
        `native output ${output.nodeId} duplicates an API callId`,
      );
  return { api, native };
}
