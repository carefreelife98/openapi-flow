import type {
  WorkflowConnectionPlanningInput,
  WorkflowConnectionPlanningDescription,
  WorkflowConnectionPlanningContext,
} from '../../types/workflow-connection-planning.js';
import { workflowConnectionIdentitySchema } from '../../schemas/workflow-connection-planning-schema.js';
import { workflowDraftEdgeSchema } from '../../schemas/workflow-draft-schema.js';
import { captureWorkflowPlanningData } from '../planning/capture-workflow-planning-data.js';
import { workflowReviewGapSchema } from '../../schemas/workflow-planning-material-schema.js';
import { createPreparedNativeNodeMaterials } from '../planning/create-prepared-native-node-materials.js';
import { createNativeOutputContracts } from '../create-native-output-contracts.js';
import { createNativePlanningCapabilityMaterial } from '../planning/create-native-planning-capability-material.js';
import { prepareWorkflowConnectionMaterials } from './prepare-workflow-connection-materials.js';

/** Capture declared data before awaiting the model; never clone opaque callbacks or forward audit metadata. */
export function describeWorkflowConnectionPlanning(
  input: WorkflowConnectionPlanningInput,
): WorkflowConnectionPlanningDescription {
  const identity = workflowConnectionIdentitySchema.parse({
    scenario: input.scenario,
    ...(input.entrypoint === undefined ? {} : { entrypoint: input.entrypoint }),
  });
  const { scenario } = identity;
  for (const field of [
    'materials',
    'capabilities',
    'nativeNodes',
    'gaps',
    'edges',
  ] as const)
    if (input[field] !== undefined && !Array.isArray(input[field]))
      throw new Error(`connection planning ${field} must be an array`);
  const supplied = input.materials === undefined ? [] : input.materials;
  const captured = captureWorkflowPlanningData({
    scenario,
    capabilities: input.capabilities,
    preparedNativeNodes: input.nativeNodes,
    materials: supplied,
  });
  const materials = captured.materials;
  const prepared = prepareWorkflowConnectionMaterials({
    materials,
    deferredApiInputIds: input.deferredApiInputIds,
    capabilities: captured.capabilities,
    nativeNodes: captured.preparedNativeNodes,
    gaps: structuredClone(
      (input.gaps === undefined ? [] : input.gaps).map((gap) =>
        workflowReviewGapSchema.parse(gap),
      ),
    ),
    edges: structuredClone(
      (input.edges === undefined ? [] : input.edges).map((edge) =>
        workflowDraftEdgeSchema.parse(edge),
      ),
    ),
  });
  const context: WorkflowConnectionPlanningContext = {
    ...structuredClone(identity),
    nodes: structuredClone(prepared.contracts),
    ...(prepared.nativeNodes.length
      ? {
          nativeNodes: structuredClone(
            createPreparedNativeNodeMaterials(
              prepared.nativeNodes,
              prepared.capabilities,
            ),
          ),
          nativeParameterReadiness: prepared.nativeNodes.map((node) => ({
            nodeId: node.id,
            planTimeStatus: 'validated' as const,
            executionInputPointers:
              node.runtimeParameters === undefined
                ? []
                : node.runtimeParameters === true
                  ? ['']
                  : [...node.runtimeParameters.pointers],
          })),
        }
      : {}),
    edges: structuredClone(prepared.edges),
    gaps: structuredClone(prepared.gaps),
    readyCallIds: materials.flatMap((material) =>
      material.status === 'ready' ? [material.arguments.callId] : [],
    ),
    apiRoles: materials.flatMap((material) =>
      material.purpose === undefined
        ? []
        : [
            {
              callId:
                material.status === 'ready'
                  ? material.arguments.callId
                  : material.callId,
              purpose: material.purpose,
            },
          ],
    ),
    ...(prepared.deferredApiInputs === undefined
      ? {}
      : { deferredApiInputs: structuredClone(prepared.deferredApiInputs) }),
  };
  return {
    input: { ...prepared, ...identity },
    context,
    sources: structuredClone({
      materials,
      nativeOutputs: createNativeOutputContracts({
        nativeNodes: prepared.nativeNodes,
        capabilities: prepared.capabilities,
      }),
      capabilities: prepared.capabilities.map((capability) =>
        createNativePlanningCapabilityMaterial(capability, false),
      ),
    }),
  };
}
