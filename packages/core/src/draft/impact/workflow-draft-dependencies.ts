import type { WorkflowDraftInput } from '../../types/workflow-draft.js';
import { resolveWorkflowDraftNodeContracts } from '../contracts/resolve-workflow-draft-node-contracts.js';

export function workflowDraftDependencies(
  input: WorkflowDraftInput,
): Map<string, Set<string>> {
  const contracts = resolveWorkflowDraftNodeContracts(input);
  return new Map(
    contracts.map((contract) => [
      contract.id,
      new Set([
        ...input.draft.edges
          .filter((edge) => edge.to === contract.id)
          .map((edge) => edge.from),
        ...contract.references.map((reference) => reference.nodeId),
        ...Object.values(contract.inputReferences ?? {})
          .flat()
          .map((reference) => reference.nodeId),
        ...contract.dependencyNodeIds,
        ...(contract.rejoinsExclusiveOutputs === undefined
          ? []
          : [contract.rejoinsExclusiveOutputs]),
      ]),
    ]),
  );
}

export function transitiveDraftDependencies(
  nodeId: string,
  dependencies: Map<string, Set<string>>,
): string[] {
  const seen = new Set<string>();
  const pending = [...requiredDependencies(nodeId, dependencies)];
  while (pending.length) {
    const id = pending.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...requiredDependencies(id, dependencies));
  }
  return [...seen];
}

function requiredDependencies(
  nodeId: string,
  dependencies: Map<string, Set<string>>,
): Set<string> {
  const found = dependencies.get(nodeId);
  if (!found)
    throw new Error(`Draft dependencies do not declare node ${nodeId}`);
  return found;
}
