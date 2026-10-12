import type { ValidateNativeApiResponseReferencesInput } from '../types/workflow-capability-planning.js';
import { assertApiCallIdentities } from './assert-api-call-identities.js';
import { parseNativeNodeParameters } from './parse-native-node-parameters.js';

export function validateNativeApiResponseReferences({
  nativeNodes,
  capabilities,
  apiCallIds,
}: ValidateNativeApiResponseReferencesInput): void {
  assertApiCallIdentities(apiCallIds);
  const registry = new Map(
    capabilities.map((capability) => [capability.name, capability]),
  );
  if (registry.size !== capabilities.length)
    throw new Error('planning.capabilities contains duplicate names');
  const available = new Set(apiCallIds);
  for (const native of nativeNodes) {
    const capability = registry.get(native.capability);
    if (!capability)
      throw new Error(
        `node ${native.id}: unknown capability ${native.capability}`,
      );
    const parameters = parseNativeNodeParameters(native, capability);
    const references = [
      ...capability.responseReferences(parameters),
      ...Object.values(
        capability.inputReferences
          ? capability.inputReferences(parameters)
          : {},
      )
        .flat()
        .filter((reference) => reference.source === 'response'),
    ];
    for (const [index, reference] of references.entries())
      if (!available.has(reference.nodeId))
        throw new Error(
          `node ${native.id}: responseReferences[${index}].nodeId ${JSON.stringify(reference.nodeId)} is not a supplied API callId; available ${JSON.stringify(apiCallIds)}`,
        );
  }
}
