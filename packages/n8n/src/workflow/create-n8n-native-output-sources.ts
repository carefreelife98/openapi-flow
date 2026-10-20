import {
  inspectNativeReferenceStructure,
  resolveNativeStructureParameters,
} from '@openapi-flow/core';
import type {
  CreateN8nNativeOutputSourcesInput,
  N8nNativeOutputSource,
} from '../types/output-binding-source.js';
import { resolveN8nNativeMaterials } from './resolve-n8n-native-materials.js';
import { compileNativeMaterialFragments } from './compile-native-material-fragments.js';
import { prepareNativeRuntimeInputs } from './inputs/compile-native-runtime-inputs.js';

/** Resolve runtime names from the actual SDK producer, not an ID/name guess. */
export function createN8nNativeOutputSources(
  input: CreateN8nNativeOutputSourcesInput,
): N8nNativeOutputSource[] {
  const references = input.nativeNodes.flatMap((node) => {
    const capability = input.capabilities.find(
      (capability) => capability.name === node.capability,
    );
    if (!capability)
      throw new Error('Missing native compiler ' + node.capability);
    if (capability.referenceStructureSchema)
      return inspectNativeReferenceStructure({ node, capability }).map(
        (binding) => binding.reference,
      );
    const parameters = resolveNativeStructureParameters(node, capability);
    return [
      ...capability.responseReferences(parameters),
      ...Object.values(
        capability.inputReferences
          ? capability.inputReferences(parameters)
          : {},
      ).flat(),
    ];
  });
  for (const reference of references)
    if (
      reference.source === 'response' &&
      (!input.apiResponseContracts ||
        !Object.hasOwn(input.apiResponseContracts, reference.nodeId))
    )
      throw new Error(
        'createN8nNativeOutputSources.apiResponseContracts is missing ' +
          reference.nodeId,
      );
  const apiMaterials =
    input.apiResponseContracts === undefined
      ? []
      : Object.entries(input.apiResponseContracts).map(
          ([callId, operation]) => ({ callId, operation }),
        );
  const externalNativeOutputSources =
    input.externalNativeOutputSources === undefined
      ? []
      : input.externalNativeOutputSources;
  const nativeInputs =
    input.nativeInputs === undefined
      ? undefined
      : prepareNativeRuntimeInputs({
          nativeInputs: input.nativeInputs,
          nativeNodes: input.nativeNodes,
          capabilities: input.capabilities,
          apiMaterials,
          nativeOutputs: externalNativeOutputSources,
        });
  const materials = resolveN8nNativeMaterials({
    apiMaterials,
    nativeOutputs: externalNativeOutputSources,
    nativeNodes: input.nativeNodes,
    capabilities:
      nativeInputs === undefined
        ? input.capabilities
        : nativeInputs.capabilities,
  });
  return compileNativeMaterialFragments({
    nativeNodes: input.nativeNodes,
    materials,
    apiMaterials,
    apiNodeNames: input.apiNodeNames,
    externalNativeOutputSources,
    nodeIds: materials.outputs.map((output) => output.nodeId),
  }).outputSources;
}
