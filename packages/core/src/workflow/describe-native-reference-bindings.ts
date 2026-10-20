import { isDeepStrictEqual } from 'node:util';
import type {
  DescribeNativeReferenceBindingsInput,
  WorkflowNativeReferenceBinding,
  WorkflowNativeParameterReference,
} from '../types/native-parameter-reference.js';
import { resolveNativeStructureParameters } from './resolve-native-structure-parameters.js';
import { validateNativeReferenceBindingLocations } from './validate-native-reference-binding-locations.js';

/** Validate an implementation's declared locations against its actual reference declarations. */
export function describeNativeReferenceBindings(
  input: DescribeNativeReferenceBindingsInput,
): WorkflowNativeReferenceBinding[] {
  if (typeof input.capability.parameterReferenceBindings !== 'function')
    throw new Error(
      `Native capability ${input.capability.name} must declare parameterReferenceBindings for bounded consumer repair`,
    );
  const parameters = resolveNativeStructureParameters(
    input.node,
    input.capability,
  );
  const references: WorkflowNativeParameterReference[] = [
    ...input.capability.responseReferences(parameters),
    ...(input.capability.nodeOutputReferences
      ? input.capability.nodeOutputReferences(parameters)
      : []),
    ...Object.values(
      input.capability.inputReferences
        ? input.capability.inputReferences(parameters)
        : {},
    ).flat(),
    ...(input.capability.rejoinsExclusiveOutputs
      ? [
          {
            source: 'exclusive-output' as const,
            nodeId: input.capability.rejoinsExclusiveOutputs(parameters),
          },
        ]
      : []),
  ];
  const bindings = input.capability.parameterReferenceBindings(parameters);
  if (!Array.isArray(bindings))
    throw new Error(
      `Native capability ${input.capability.name}.parameterReferenceBindings must return an array`,
    );
  validateNativeReferenceBindingLocations(input.node.id, parameters, bindings);
  for (const binding of bindings) {
    if (
      !references.some((reference) =>
        isDeepStrictEqual(reference, binding.reference),
      )
    )
      throw new Error(
        `Native reference binding for ${input.node.id} is not an implementation-declared reference`,
      );
  }
  if (
    references.some(
      (reference) =>
        !bindings.some((binding) =>
          isDeepStrictEqual(binding.reference, reference),
        ),
    )
  )
    throw new Error(
      `Native capability ${input.capability.name}.parameterReferenceBindings omits a declared reference`,
    );
  return structuredClone(bindings);
}
