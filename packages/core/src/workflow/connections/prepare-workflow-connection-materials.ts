import { createReviewableNodeContracts } from '../create-reviewable-node-contracts.js';
import { createNativeOutputContracts } from '../create-native-output-contracts.js';
import { validateWorkflowEdges } from '../validate-workflow-edges.js';
import { inspectApiArgumentRequirements } from '../../arguments/clarification/inspect-api-argument-requirements.js';
import { validateApiBindingAssignments } from '../../bindings/validate-api-binding-assignments.js';
import { validateNativeApiResponseReferences } from '../validate-native-api-response-references.js';
import { createNativeParameterGenerationContract } from '../../schemas/create-native-parameter-generation-contract.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';
import type { ReviewableWorkflowGraphPlan } from '../../types/reviewable-workflow.js';
import type {
  WorkflowConnectionMaterialInput,
  WorkflowConnectionMaterials,
} from '../../types/workflow-connection-planning.js';

/** Validate immutable supplied data before paying for any orchestration model call. */
export function prepareWorkflowConnectionMaterials(
  input: WorkflowConnectionMaterialInput,
): WorkflowConnectionMaterials {
  for (const field of [
    'materials',
    'capabilities',
    'nativeNodes',
    'gaps',
    'edges',
  ] as const)
    if (input[field] !== undefined && !Array.isArray(input[field]))
      throw new Error(`connection materials ${field} must be an array`);
  const materials = input.materials === undefined ? [] : input.materials;
  const capabilities =
    input.capabilities === undefined ? [] : input.capabilities;
  const nativeNodes = input.nativeNodes === undefined ? [] : input.nativeNodes;
  const gaps = input.gaps === undefined ? [] : input.gaps;
  const edges = input.edges === undefined ? [] : input.edges;
  for (const material of materials) {
    if (material.status !== 'blocked') continue;
    if (
      !Array.isArray(material.gapIds) ||
      !material.gapIds.length ||
      new Set(material.gapIds).size !== material.gapIds.length ||
      material.gapIds.some((id) => !gaps.some((gap) => gap.id === id))
    )
      throw new Error(
        `materials[${material.callId}].gapIds must name declared gaps exactly once`,
      );
  }
  validateNativeApiResponseReferences({
    nativeNodes,
    capabilities,
    apiCallIds: materials.map((material) =>
      material.status === 'ready' ? material.arguments.callId : material.callId,
    ),
  });
  // Ownership inspection may accept unfinished literals while deriving a slot.
  // Final connection materials may not: every non-runtime setting must be ready.
  for (const node of nativeNodes) {
    if (node.runtimeParameters === undefined || node.runtimeParameters === true)
      continue;
    const capability = capabilities.find(
      (entry) => entry.name === node.capability,
    );
    if (!capability)
      throw new Error(
        `connection native ${node.id}: missing capability ${node.capability}`,
      );
    const contract = createNativeParameterGenerationContract({
      nodeId: node.id,
      capability,
      runtimeParameters: node.runtimeParameters,
    });
    const checked = contract.valuesSchema.safeParse(node.parameters);
    if (!checked.success || !jsonValuesEqual(checked.data, node.parameters))
      throw new Error(
        `connection native ${node.id}: unresolved or invalid plan-time parameter literals`,
        { cause: checked.success ? undefined : checked.error },
      );
  }
  const nativeOutputs = createNativeOutputContracts({
    nativeNodes,
    capabilities,
  });
  for (const material of materials) {
    if (material.status !== 'ready') continue;
    const args = material.arguments;
    const validation = inspectApiArgumentRequirements({
      operation: material.operation,
      ...args,
    });
    if (args.unresolvedInputs.length || validation.status !== 'ready')
      throw new Error(
        `materials[${args.callId}] has unresolved OAS request inputs or scenario-requested inputs`,
      );
  }
  if (materials.length)
    validateApiBindingAssignments({
      nativeOutputs,
      materials: materials.map((material) => ({
        operation: material.operation,
        callId:
          material.status === 'ready'
            ? material.arguments.callId
            : material.callId,
        requestMediaType:
          material.status === 'ready'
            ? material.arguments.requestMediaType
            : material.requestMediaType,
      })),
      calls: materials.map((material) => ({
        callId:
          material.status === 'ready'
            ? material.arguments.callId
            : material.callId,
        bindings:
          material.status === 'ready'
            ? material.arguments.bindings
            : material.bindings,
      })),
    });
  const plan: ReviewableWorkflowGraphPlan = {
    nativeNodes,
    gaps,
    edges,
    starts: [],
    blockedCalls: materials.flatMap((material) =>
      material.status === 'blocked'
        ? [{ callId: material.callId, gapIds: material.gapIds }]
        : [],
    ),
  };
  const contracts = createReviewableNodeContracts({
    materials,
    capabilities,
    plan,
  });
  validateWorkflowEdges({ contracts, edges });
  return { materials, capabilities, nativeNodes, gaps, edges, contracts };
}
