import type {
  NativeNodeConfigurationInput,
  NativeNodeParameterResult,
} from '../../types/native-node-planning.js';
import { resolveNativeConfigurationMaterials } from './resolve-native-configuration-materials.js';
import {
  describeNativeNodeConfiguration,
  resolveNativeNodeParameters,
} from './describe-native-node-configuration.js';

/** Allowed source candidates cannot determine a remaining parameter choice. */
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
  // The dependency receipt grants access, not a binding of every listed producer.
  // Let value generation choose actual references whenever its schema permits a choice.
  if (materials.instance.hasLiteralParameters) return undefined;
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
