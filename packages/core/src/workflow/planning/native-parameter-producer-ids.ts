import type { WorkflowPlanNodeContract } from '../../types/workflow-plan.js';

/** Parameter references only, not execution edges or inferred scheduling dependencies. */
export function nativeParameterProducerIds(
  contract: WorkflowPlanNodeContract,
): string[] {
  return [
    ...new Set([
      ...contract.references.map((reference) => reference.nodeId),
      ...Object.values(
        contract.inputReferences === undefined ? {} : contract.inputReferences,
      )
        .flat()
        .map((reference) => reference.nodeId),
      ...(contract.rejoinsExclusiveOutputs === undefined
        ? []
        : [contract.rejoinsExclusiveOutputs]),
    ]),
  ].sort();
}
