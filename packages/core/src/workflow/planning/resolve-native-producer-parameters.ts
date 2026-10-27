import type {
  NativeNodeConfigurationInput,
  NativeNodeParameterResult,
} from '../../types/native-node-planning.js';
import { resolveNativeConfigurationMaterials } from './resolve-native-configuration-materials.js';
import {
  describeNativeNodeConfiguration,
  resolveNativeNodeParameters,
} from './describe-native-node-configuration.js';

/** No model choice remains only when the registered implementation explicitly declares complete ownership. */
export function resolveNativeProducerParameters(
  input: NativeNodeConfigurationInput,
): NativeNodeParameterResult | undefined {
  if (
    input.dependencies === undefined ||
    !input.capabilities?.some(
      (capability) =>
        capability.parametersFromProducerDependencies !== undefined,
    )
  )
    return undefined;
  const materials = resolveNativeConfigurationMaterials(input);
  const derive = materials.capability.parametersFromProducerDependencies;
  if (derive === undefined || materials.sourceDependencies === undefined)
    return undefined;
  if (materials.instance.runtimeParameters !== undefined)
    throw new Error(
      `Native instance ${input.nodeId}: producer-derived parameters cannot replace execution-owned fields`,
    );
  const parameters = derive(
    Object.freeze([...materials.sourceDependencies.sourceNodeIds]),
  );
  return resolveNativeNodeParameters({
    ...input,
    fingerprint: describeNativeNodeConfiguration(input).fingerprint,
    proposal: {
      decision: {
        status: 'provided',
        parameters,
        ...(input.includeExplanations
          ? {
              reason:
                'The registered implementation derives complete settings from the validated producer selection.',
            }
          : {}),
      },
    },
  });
}
