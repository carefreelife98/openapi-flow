import {
  createNativeRuntimeParameterMaterializations,
  captureNativePlanningCapability,
} from '@openapi-flow/core';
import type { CreateRuntimeInputNativeCapabilitiesInput } from '../../types/native-runtime-parameters.js';
import type { N8nNativeCapability } from '../../types/native-capability.js';

/** Runtime ownership remains explicit; the original schema and metadata are never replaced. */
export function createRuntimeInputNativeCapabilities(
  input: CreateRuntimeInputNativeCapabilitiesInput,
): N8nNativeCapability[] {
  function wrap(capability: N8nNativeCapability): N8nNativeCapability {
    if (capability.supportsRuntimeParameters !== true) return capability;
    const bind = capability.bindMaterialContracts;
    return {
      ...capability,
      ...captureNativePlanningCapability(capability),
      bindMaterialContracts:
        bind === undefined
          ? undefined
          : (sources) => wrap(bind.call(capability, sources)),
      compile(source) {
        if (source.planned.runtimeParameters === undefined)
          return capability.compile(source);
        const [materialization] = createNativeRuntimeParameterMaterializations({
          nativeNodes: [source.planned],
          capabilities: [capability],
        });
        if (
          !materialization ||
          materialization.inputs.some(
            (source) => !input.slots.some((slot) => slot.id === source.id),
          )
        )
          throw new Error(
            `node ${source.planned.id}: template has no declared native runtime input slot`,
          );
        return capability.compile({
          ...source,
          runtimeInput: {
            materialization,
            revision: input.revision,
            inputNodeName: input.inputNodeName,
          },
        });
      },
    };
  }
  return input.capabilities.map(wrap);
}
