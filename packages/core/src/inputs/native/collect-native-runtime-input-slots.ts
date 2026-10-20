import { createHash } from 'node:crypto';
import type {
  CollectNativeRuntimeInputSlotsInput,
  NativeRuntimeInputSlot,
} from '../../types/native-runtime-inputs.js';
import { resolveNativeStructureParameters } from '../../workflow/resolve-native-structure-parameters.js';
import { createNativeRuntimeParametersSchema } from '../../schemas/create-native-runtime-parameters-schema.js';
import { schemasAtPointer } from '../../bindings/schema-at-pointer.js';
import { createSchemaResourceContext } from '../../bindings/resources/create-schema-resource-context.js';

/** Slot identities are owned by code and scoped to the original node and schema. */
export function collectNativeRuntimeInputSlots(
  input: CollectNativeRuntimeInputSlotsInput,
): NativeRuntimeInputSlot[] {
  if (!Array.isArray(input.nativeNodes) || !Array.isArray(input.capabilities))
    throw new Error(
      'native runtime input nativeNodes and capabilities must be arrays',
    );
  const registry = new Map(
    input.capabilities.map((capability) => [capability.name, capability]),
  );
  if (registry.size !== input.capabilities.length)
    throw new Error(
      'native runtime input capabilities requires distinct names',
    );
  const ids = new Set<string>();
  return input.nativeNodes.flatMap((planned) => {
    if (
      !planned ||
      typeof planned.id !== 'string' ||
      !planned.id.trim() ||
      ids.has(planned.id)
    )
      throw new Error(
        'native runtime inputs require distinct non-empty node IDs',
      );
    ids.add(planned.id);
    const capability = registry.get(planned.capability);
    if (!capability)
      throw new Error(
        `node ${planned.id}: unknown capability ${planned.capability}`,
      );
    resolveNativeStructureParameters(planned, capability);
    if (planned.runtimeParameters === undefined) return [];
    const originalSchema = createNativeRuntimeParametersSchema(capability);
    const resources = createSchemaResourceContext(originalSchema);
    const pointers =
      planned.runtimeParameters === true
        ? ['']
        : planned.runtimeParameters.pointers;
    return pointers.map((targetPointer) => {
      const projection =
        targetPointer === ''
          ? originalSchema
          : schemasAtPointer(resources.root, targetPointer, resources)[0];
      if (projection === undefined)
        throw new Error(
          `node ${planned.id}: runtime parameter ${targetPointer} is not permitted by its original schema`,
        );
      const schema =
        targetPointer === '' ? originalSchema : resources.bundle(projection);
      const hash = createHash('sha256')
        .update(
          JSON.stringify({
            nodeId: planned.id,
            capability: capability.name,
            schema,
            ...(targetPointer === ''
              ? {}
              : {
                  targetPointer,
                  parameters: planned.parameters,
                  pointers: [...pointers].sort(),
                }),
          }),
        )
        .digest('hex');
      return {
        kind: 'native-parameters-input' as const,
        state: 'deferred' as const,
        id: `native-input:${hash}`,
        nodeId: planned.id,
        capability: capability.name,
        targetPointer,
        schema,
        description: capability.description,
      };
    });
  });
}
