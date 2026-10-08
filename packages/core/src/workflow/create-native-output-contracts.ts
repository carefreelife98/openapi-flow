import type {
  CreateNativeOutputContractsInput,
  NativeOutputContract,
} from '../types/node-output.js';
import { parseNativeNodeParameters } from './parse-native-node-parameters.js';
import { validateNativeOutputContracts } from '../bindings/validate-native-output-contracts.js';

/** Derive contracts from actual capabilities/parameters, never model guesses. */
export function createNativeOutputContracts({
  nativeNodes,
  capabilities,
}: CreateNativeOutputContractsInput): NativeOutputContract[] {
  const registry = new Map(capabilities.map((item) => [item.name, item]));
  if (registry.size !== capabilities.length)
    throw new Error('capabilities contains duplicate names');
  const ids = new Set<string>();
  const outputs = nativeNodes.flatMap((planned) => {
    if (!planned.id.trim() || ids.has(planned.id))
      throw new Error('native nodes require unique non-empty IDs');
    ids.add(planned.id);
    const capability = registry.get(planned.capability);
    if (!capability)
      throw new Error(
        `node ${planned.id}: unknown capability ${planned.capability}`,
      );
    const parameters = parseNativeNodeParameters(planned, capability);
    return capability.outputSchema
      ? [{ nodeId: planned.id, schema: capability.outputSchema(parameters) }]
      : [];
  });
  validateNativeOutputContracts(outputs);
  return outputs;
}
