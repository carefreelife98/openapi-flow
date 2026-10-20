import type {
  WorkflowPlanningDataInput,
  WorkflowPlanningDataSnapshot,
} from '../../types/workflow-planning-materials.js';
import type { ReviewableWorkflowApiMaterial } from '../../types/reviewable-workflow.js';
import {
  workflowMaterialArgumentSchema,
  workflowBlockedCallSchema,
} from '../../schemas/workflow-planning-material-schema.js';
import { captureWorkflowPlanningMaterials } from './capture-workflow-planning-materials.js';

/** Capture only declared source data, without requiring not-yet-generated native producers. */
export function captureWorkflowPlanningData(
  input: WorkflowPlanningDataInput,
): WorkflowPlanningDataSnapshot {
  if (!Array.isArray(input.materials))
    throw new Error('workflow planning materials must be an array');
  for (const material of input.materials)
    if (!material || !['ready', 'blocked'].includes(material.status))
      throw new Error(
        'workflow planning materials require ready or blocked status',
      );
  const captured = captureWorkflowPlanningMaterials({
    scenario: input.scenario,
    capabilities: input.capabilities,
    preparedNativeNodes: input.preparedNativeNodes,
    apiMaterials: input.materials.map((material) => ({
      callId:
        material.status === 'ready'
          ? material.arguments?.callId
          : material.callId,
      operation: material.operation,
      purpose: material.purpose,
      requestMediaType:
        material.status === 'ready'
          ? material.arguments?.requestMediaType
          : material.requestMediaType,
    })),
  });
  const materials: ReviewableWorkflowApiMaterial[] = input.materials.map(
    (material, index) => {
      const { operation, purpose, requestMediaType } =
        captured.apiMaterials[index];
      const common = {
        operation,
        ...(purpose === undefined ? {} : { purpose }),
      };
      if (material.status === 'ready') {
        const args = material.arguments;
        return {
          status: 'ready',
          ...common,
          arguments: structuredClone(
            workflowMaterialArgumentSchema.parse({
              callId: args.callId,
              values: args.values,
              bindings: args.bindings,
              ...(args.requestedInputs === undefined
                ? {}
                : { requestedInputs: args.requestedInputs }),
              unresolvedInputs: args.unresolvedInputs,
              ...(args.requestMediaType === undefined
                ? {}
                : { requestMediaType: args.requestMediaType }),
            }),
          ),
        };
      }
      return {
        status: 'blocked',
        ...common,
        ...workflowBlockedCallSchema.parse({
          callId: captured.apiMaterials[index].callId,
          gapIds: structuredClone(material.gapIds),
        }),
        bindings: structuredClone(
          workflowMaterialArgumentSchema.shape.bindings.parse(
            material.bindings,
          ),
        ),
        ...(requestMediaType === undefined ? {} : { requestMediaType }),
      };
    },
  );
  return {
    materials,
    capabilities: captured.capabilities,
    preparedNativeNodes: captured.preparedNativeNodes,
  };
}
