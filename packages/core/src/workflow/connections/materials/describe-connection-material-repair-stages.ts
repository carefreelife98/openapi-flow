import type { WorkflowConnectionPlanningSnapshot } from '../../../types/workflow-connection-planning.js';
import type { WorkflowConnectionMaterialRepairStage } from '../../../types/workflow-connection-material-repair.js';
import { createApiArgumentGenerationContract } from '../../../schemas/create-api-argument-generation-contract.js';

/** Hide API stages only when the existing OAS ownership contract proves there are no editable inputs. */
export function describeConnectionMaterialRepairStages(
  input: WorkflowConnectionPlanningSnapshot,
): WorkflowConnectionMaterialRepairStage[] {
  const bindings: string[] = [];
  const literalCallIds: string[] = [];
  for (const material of input.materials) {
    if (material.status !== 'ready') continue;
    const shared = {
      operation: material.operation,
      requestMediaType: material.arguments.requestMediaType,
    };
    if (
      createApiArgumentGenerationContract({ ...shared, bindings: [] })
        .hasLiteralInputs
    )
      bindings.push(material.arguments.callId);
    if (
      createApiArgumentGenerationContract({
        ...shared,
        bindings: material.arguments.bindings,
      }).hasLiteralInputs
    )
      literalCallIds.push(material.arguments.callId);
  }
  // Native stage contracts remain identity-based here; this does not infer their business necessity.
  const natives = input.nativeNodes.map((node) => node.id);
  return [
    { stage: 'api-bindings', nodeIds: bindings },
    { stage: 'api-arguments', nodeIds: literalCallIds },
    { stage: 'native-dependencies', nodeIds: natives },
    { stage: 'native-parameters', nodeIds: natives },
  ];
}
