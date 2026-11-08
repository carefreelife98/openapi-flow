import type {
  InspectWorkflowProgramDeliveryInput,
  WorkflowProgramDelivery,
} from '../../types/workflow-execution-program.js';
import { validateWorkflowExecutionProgram } from './resolve-workflow-execution-program.js';
import { describeResolvedWorkflowExecutionProgram } from './describe-resolved-workflow-execution-program.js';
import { validateReviewableWorkflowGraphPlan } from '../validate-reviewable-workflow-graph-plan.js';

/** Retain only checked, dependency-closed prefixes. Never invent starts or bypass a condition. */
export function inspectWorkflowProgramDelivery(
  input: InspectWorkflowProgramDeliveryInput,
): WorkflowProgramDelivery {
  const result = validateWorkflowExecutionProgram(input);
  const contracts =
    describeResolvedWorkflowExecutionProgram(input).context.nodes;
  const excluded = new Set(input.blockedNodeIds);
  if (
    !excluded.size ||
    excluded.size !== input.blockedNodeIds.length ||
    [...excluded].some((id) => !contracts.some((node) => node.id === id))
  )
    throw new Error(
      'Program partial delivery requires distinct blocked IDs from its checked graph',
    );
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of contracts) {
      if (excluded.has(node.id)) continue;
      const outgoing = result.plan.edges.filter(
        (edge) => edge.from === node.id,
      );
      const invalid =
        node.dependencyNodeIds.some((id) => excluded.has(id)) ||
        result.plan.edges.some(
          (edge) => edge.to === node.id && excluded.has(edge.from),
        ) ||
        (node.exclusiveOutputPorts &&
          outgoing.some((edge) => excluded.has(edge.to)));
      if (invalid) {
        excluded.add(node.id);
        changed = true;
      }
    }
  }
  const kept = new Set(
    contracts.filter((node) => !excluded.has(node.id)).map((node) => node.id),
  );
  const materials = input.materials!.filter((material) =>
    kept.has(
      material.status === 'ready' ? material.arguments.callId : material.callId,
    ),
  );
  const plan = {
    ...result.plan,
    nativeNodes: result.plan.nativeNodes.filter((node) => kept.has(node.id)),
    edges: result.plan.edges.filter(
      (edge) => kept.has(edge.from) && kept.has(edge.to),
    ),
    starts: result.plan.starts.filter((id) => kept.has(id)),
  };
  const delivery = {
    sourceFingerprint: result.sourceFingerprint,
    blockedNodeIds: [...input.blockedNodeIds],
    excludedNodeIds: contracts
      .filter((node) => excluded.has(node.id))
      .map((node) => node.id),
    materials,
    plan,
  };
  if (!kept.size) return { status: 'unavailable', ...delivery };
  validateReviewableWorkflowGraphPlan({
    ...input,
    materials,
    capabilities: [
      ...input.capabilities!,
      ...(input.controls?.capabilities ?? []),
    ],
    plan,
  });
  return { status: 'partial', ...delivery };
}
