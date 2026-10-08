import type { NativeOutputContract } from '../types/node-output.js';
import { isObject } from '../utils/is-object.js';

/** Validate the declaration boundary; the adapter compiles the JSON Schemas. */
export function validateNativeOutputContracts(
  outputs: NativeOutputContract[],
): void {
  if (!Array.isArray(outputs))
    throw new Error('nativeOutputs must be an array');
  const ids = new Set<string>();
  for (const output of outputs) {
    if (!output || typeof output.nodeId !== 'string' || !output.nodeId.trim())
      throw new Error('nativeOutputs.nodeId must be a non-empty string');
    if (ids.has(output.nodeId))
      throw new Error('native outputs require unique node IDs');
    ids.add(output.nodeId);
    if (typeof output.schema !== 'boolean' && !isObject(output.schema))
      throw new Error(
        `nativeOutputs[${output.nodeId}].schema must be a JSON Schema object or boolean`,
      );
  }
}
