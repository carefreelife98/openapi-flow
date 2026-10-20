import type {
  NativeNodePlanningInput,
  NativeNodePlanningDescription,
  NativeNodePlanningSnapshot,
} from '../../types/native-node-planning.js';
import { nativeNodePlanningOptionsSchema } from '../../schemas/native-node-planning-record-schema.js';
import { createWorkflowPlanningCapabilities } from '../create-workflow-planning-capabilities.js';
import { createPreparedNativeNodeMaterials } from './create-prepared-native-node-materials.js';
import { createNativePlanningCapabilityMaterial } from './create-native-planning-capability-material.js';
import { captureWorkflowPlanningMaterials } from './capture-workflow-planning-materials.js';
import { resolveNativePlanningMaterials } from './resolve-native-planning-materials.js';

/** Capture data and registry fields, not arbitrary JavaScript closure state or provider authenticity. */
export function describeNativeNodePlanning(
  input: NativeNodePlanningInput,
): NativeNodePlanningDescription {
  const options = nativeNodePlanningOptionsSchema.parse({
    planId: input.planId,
    scenario: input.scenario,
    allowRuntimeParameters: input.allowRuntimeParameters,
  });
  const {
    capabilities,
    apiMaterials,
    preparedNativeNodes: prepared,
  } = captureWorkflowPlanningMaterials(input);
  const apiIds = apiMaterials.map((material) => material.callId);
  const planningCapabilities = createWorkflowPlanningCapabilities({
    capabilities,
    apiCallIds: apiIds,
  });
  const snapshot: NativeNodePlanningSnapshot = {
    ...options,
    capabilities,
    apiMaterials,
    preparedNativeNodes: prepared,
  };
  return {
    input: snapshot,
    planningCapabilities,
    context: {
      scenario: options.scenario,
      apiMaterials: apiMaterials.map(({ callId, operation, purpose }) => ({
        callId,
        ...(purpose === undefined ? {} : { purpose }),
        ...structuredClone({
          key: operation.key,
          method: operation.method,
          path: operation.path,
          operation: operation.operation,
          effective: operation.effective,
        }),
      })),
      preparedNativeNodes: structuredClone(
        createPreparedNativeNodeMaterials(
          prepared,
          resolveNativePlanningMaterials({
            nativeNodes: prepared,
            capabilities,
            apiMaterials,
            nativeOutputs: [],
          }).capabilities,
        ),
      ),
      capabilities: planningCapabilities.map((capability) =>
        createNativePlanningCapabilityMaterial(
          capability,
          options.allowRuntimeParameters === true,
        ),
      ),
    },
  };
}
