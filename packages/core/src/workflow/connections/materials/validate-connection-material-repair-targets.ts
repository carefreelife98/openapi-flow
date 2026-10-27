import type { WorkflowConnectionMaterialRepairRequest } from '../../../types/workflow-connection-revision.js';
import type { WorkflowConnectionSessionSource } from '../../../types/workflow-connection-session.js';
import { workflowConnectionMaterialRepairRequestSchema } from '../../../schemas/workflow-connection-revision-schema.js';
import { describeConnectionSessionSource } from '../incremental/describe-connection-session-source.js';
import { describeConnectionMaterialRepairStages } from './describe-connection-material-repair-stages.js';

/** Stage ownership derives from actual API/native identities, never from a model-generated identifier. */
export function validateConnectionMaterialRepairTargets(
  source: WorkflowConnectionSessionSource,
  value: WorkflowConnectionMaterialRepairRequest,
): void {
  const { source: description } = describeConnectionSessionSource(source);
  const request = workflowConnectionMaterialRepairRequestSchema.parse(value);
  const facts = new Set(source.requirements.map((fact) => fact.id));
  if (
    new Set(request.factIds).size !== request.factIds.length ||
    request.factIds.some((id) => !facts.has(id))
  )
    throw new Error(
      'Material repair request requires actual distinct requirement IDs',
    );
  const apiIds = new Set(description.context.readyCallIds);
  const stages = describeConnectionMaterialRepairStages(description.input);
  const nativeIds = new Set(
    description.input.nativeNodes.map((node) => node.id),
  );
  const seen = new Set<string>();
  for (const target of request.targets) {
    const key = JSON.stringify([target.stage, target.nodeId]);
    if (seen.has(key)) throw new Error('Duplicate material repair target');
    seen.add(key);
    const actual =
      target.stage === 'api-bindings' || target.stage === 'api-arguments'
        ? apiIds
        : nativeIds;
    if (!actual.has(target.nodeId))
      throw new Error(
        `Material repair stage does not own node ${target.nodeId}: ${target.stage}`,
      );
    const available = stages
      .find((stage) => stage.stage === target.stage)!
      .nodeIds.includes(target.nodeId);
    // A binding repair can expose literal inputs. Its caller may explicitly include the dependent argument stage.
    const dependentArguments =
      target.stage === 'api-arguments' &&
      request.targets.some(
        (entry) =>
          entry.stage === 'api-bindings' && entry.nodeId === target.nodeId,
      ) &&
      stages
        .find((stage) => stage.stage === 'api-bindings')!
        .nodeIds.includes(target.nodeId);
    if (!available && !dependentArguments)
      throw new Error(
        `Material repair stage has no editable OAS inputs: ${target.nodeId}: ${target.stage}`,
      );
  }
}
