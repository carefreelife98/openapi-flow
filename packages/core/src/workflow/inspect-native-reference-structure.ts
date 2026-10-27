import type {
  DescribeNativeReferenceBindingsInput,
  WorkflowNativeReferenceBinding,
} from '../types/native-parameter-reference.js';
import { jsonValuesEqual } from '../utils/json-values-equal.js';
import { validateNativeReferenceBindingLocations } from './validate-native-reference-binding-locations.js';
import { resolveNativeStructureParameters } from './resolve-native-structure-parameters.js';

/** Inspect literal reference locations while their source snapshot may be unresolved. Not a material contract. */
export function inspectNativeReferenceStructure(
  input: DescribeNativeReferenceBindingsInput,
): WorkflowNativeReferenceBinding[] {
  const { node, capability } = input;
  if (node.capability !== capability.name)
    throw new Error(
      `node ${node.id}: reference structure capability ${capability.name} does not match ${node.capability}`,
    );
  if (
    !capability.referenceStructureSchema ||
    typeof capability.parameterReferenceBindings !== 'function'
  )
    throw new Error(
      `Native capability ${capability.name} requires referenceStructureSchema and parameterReferenceBindings for unresolved reference inspection`,
    );
  if (
    node.runtimeParameters !== undefined &&
    (capability.supportsRuntimeParameters !== true ||
      node.runtimeParameters === true)
  )
    throw new Error(
      `node ${node.id}: unresolved reference inspection requires literal structural parameters, not runtime ownership`,
    );
  if (node.runtimeParameters !== undefined)
    resolveNativeStructureParameters(node, capability);
  const parameters = capability.referenceStructureSchema.parse(node.parameters);
  if (!jsonValuesEqual(parameters, node.parameters))
    throw new Error(
      `node ${node.id}: reference structure schema must validate without defaults, coercion or transformation`,
    );
  const bindings = capability.parameterReferenceBindings(parameters);
  validateNativeReferenceBindingLocations(node.id, parameters, bindings);
  if (node.runtimeParameters !== undefined) {
    const locations = bindings.flatMap((binding) => [
      binding.nodeIdPointer,
      ...(binding.valuePointer === undefined ? [] : [binding.valuePointer]),
    ]);
    for (const pointer of node.runtimeParameters.pointers)
      if (
        locations.some(
          (location) =>
            pointer === location ||
            pointer === '' ||
            pointer.startsWith(location + '/') ||
            location.startsWith(pointer + '/'),
        )
      )
        throw new Error(
          `node ${node.id}: runtime parameter ${pointer} overlaps a literal reference location`,
        );
  }
  return structuredClone(bindings);
}
