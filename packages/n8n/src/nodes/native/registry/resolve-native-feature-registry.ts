import type {
  N8nNativePlanningFeatureRegistry,
  N8nNativeFeatureResolutionMode,
  N8nNativeFeaturePlanningDefinition,
  N8nNativeFeatureRegistration,
  ResolveN8nNativeFeaturesInput,
} from '../../../types/native-feature-registry.js';
import { N8nNativeFeature } from '../../../types/native-feature-registry.js';
import { n8nNativeFeatureSelectionSchema } from '../../../schemas/native-feature-registry-schema.js';
import { nativeFeatureDefinitions } from './native-feature-definitions.js';
import { validateNativeFeatureContext } from './validate-native-feature-context.js';

/** No model calls, fabricated contracts, source discovery or automatic registration retries. */
export function resolveNativeFeatureRegistry(
  input: ResolveN8nNativeFeaturesInput,
  mode: N8nNativeFeatureResolutionMode,
): N8nNativePlanningFeatureRegistry {
  validateNativeFeatureContext(input);
  const selection = n8nNativeFeatureSelectionSchema.safeParse(
    input.features === undefined
      ? Object.values(N8nNativeFeature)
      : input.features,
  );
  if (!selection.success)
    throw new Error('native features.features is invalid', {
      cause: selection.error,
    });
  const registrations = selection.data.map(
    (feature): N8nNativeFeatureRegistration => {
      const definition = nativeFeatureDefinitions[feature];
      if (!definition)
        throw new Error(`native feature ${feature} has no registered factory`);
      const missingContext = definition.requirements
        .filter((requirement) => {
          if (requirement.field === 'jsonOutput')
            return input.jsonOutput === undefined;
          const materials = input[requirement.field];
          return (
            materials === undefined ||
            materials.length < requirement.minimumItems
          );
        })
        .map((requirement) => ({ ...requirement }));
      if (missingContext.length) {
        if (mode === 'materials' && input.features !== undefined) {
          const requiredFields = missingContext
            .map((requirement) =>
              requirement.field === 'jsonOutput'
                ? requirement.field
                : `${requirement.field} (at least ${requirement.minimumItems})`,
            )
            .join(', ');
          throw new Error(
            `native feature ${feature} requires ${requiredFields}`,
          );
        }
        return { feature, status: 'requires-context', missingContext };
      }
      const capability = definition.create(input);
      if (
        feature !== N8nNativeFeature.JsonOutput &&
        capability.name !== feature
      )
        throw new Error(
          `native feature ${feature} factory changed its identity`,
        );
      return { feature, status: 'ready', capability };
    },
  );
  const capabilities = [
    ...registrations.flatMap((registration) =>
      registration.status === 'ready' ? [registration.capability] : [],
    ),
    ...(input.extensions === undefined ? [] : input.extensions),
  ];
  const planningRegistrations = registrations.flatMap(
    (registration): N8nNativeFeaturePlanningDefinition[] => {
      if (registration.status === 'ready')
        return [
          {
            feature: registration.feature,
            capability: registration.capability,
          },
        ];
      if (mode === 'materials') return [];
      const factory =
        nativeFeatureDefinitions[registration.feature].createPlanning;
      return factory === undefined
        ? []
        : [
            {
              feature: registration.feature,
              capability: factory({ itemMode: input.itemMode }),
            },
          ];
    },
  );
  const planningCapabilities = [
    ...planningRegistrations.map((entry) => entry.capability),
    ...(input.extensions === undefined ? [] : input.extensions),
  ];
  const names = new Set<string>();
  for (const capability of planningCapabilities) {
    if (
      !capability ||
      typeof capability.name !== 'string' ||
      !capability.name.trim() ||
      typeof capability.description !== 'string' ||
      !capability.description.trim() ||
      !capability.parametersSchema ||
      typeof capability.parametersSchema.safeParse !== 'function' ||
      typeof capability.compile !== 'function' ||
      typeof capability.inputPorts !== 'function' ||
      typeof capability.outputPorts !== 'function' ||
      typeof capability.responseReferences !== 'function' ||
      typeof capability.waitsForAllInputs !== 'boolean' ||
      typeof capability.exclusiveOutputPorts !== 'boolean'
    )
      throw new Error(
        'native features requires complete named capability implementations',
      );
    if (names.has(capability.name))
      throw new Error(
        `native features contains duplicate capability ${capability.name}`,
      );
    names.add(capability.name);
  }
  return {
    registrations,
    capabilities,
    planningCapabilities,
    planningRegistrations,
  };
}
