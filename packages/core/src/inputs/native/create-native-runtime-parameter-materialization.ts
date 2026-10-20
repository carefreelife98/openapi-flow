import type {
  CollectNativeRuntimeInputSlotsInput,
  NativeRuntimeParameterMaterialization,
} from '../../types/native-runtime-inputs.js';
import type { RequestContainerKind } from '../../types/api-bindings.js';
import { collectNativeRuntimeInputSlots } from './collect-native-runtime-input-slots.js';
import { createNativeRuntimeParametersSchema } from '../../schemas/create-native-runtime-parameters-schema.js';
import { createSchemaResourceContext } from '../../bindings/resources/create-schema-resource-context.js';
import { schemasAtPointer } from '../../bindings/schema-at-pointer.js';
import { schemaAllowsContainer } from '../../bindings/schema-allows-container.js';
import { pointerTokens, hasPointer } from '../../bindings/json-pointer.js';

/** Derive immutable execution material from explicit owners and the actual registered schema. */
export function createNativeRuntimeParameterMaterializations(
  input: CollectNativeRuntimeInputSlotsInput,
): NativeRuntimeParameterMaterialization[] {
  const slots = collectNativeRuntimeInputSlots(input);
  return input.nativeNodes
    .filter((node) => node.runtimeParameters !== undefined)
    .map((node) => {
      const capability = input.capabilities.find(
        (entry) => entry.name === node.capability,
      )!;
      const schema = createNativeRuntimeParametersSchema(capability);
      const resources = createSchemaResourceContext(schema);
      return {
        nodeId: node.id,
        parameters: structuredClone(node.parameters),
        schema,
        inputs: slots
          .filter((slot) => slot.nodeId === node.id)
          .map((slot) => {
            const containerKinds: Record<string, RequestContainerKind> =
              Object.create(null);
            const tokens = pointerTokens(slot.targetPointer);
            for (let length = 1; length < tokens.length; length++) {
              const pointer =
                '/' +
                tokens
                  .slice(0, length)
                  .map((part) =>
                    part.replaceAll('~', '~0').replaceAll('/', '~1'),
                  )
                  .join('/');
              if (hasPointer(node.parameters, pointer)) continue;
              const projections = schemasAtPointer(
                resources.root,
                pointer,
                resources,
              );
              const kinds = (['object', 'array'] as const).filter((kind) =>
                projections.some((projection) =>
                  schemaAllowsContainer(projection, kind),
                ),
              );
              if (kinds.length !== 1)
                throw new Error(
                  `node ${node.id}: runtime parameter ${pointer} needs an explicit literal container; schema does not determine object versus array`,
                );
              containerKinds[pointer] = kinds[0];
            }
            return {
              id: slot.id,
              targetPointer: slot.targetPointer,
              containerKinds,
            };
          }),
      };
    });
}
