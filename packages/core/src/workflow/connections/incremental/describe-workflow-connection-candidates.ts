import type { WorkflowConnectionStepDescription } from '../../../types/workflow-connection-session.js';
import type {
  WorkflowConnectionCandidateGroup,
  WorkflowConnectionPortCandidate,
} from '../../../types/workflow-connection-region.js';

/** Exclude only connections contradicted by explicit independence and declared reads. */
export function describeWorkflowConnectionCandidates(
  description: Pick<WorkflowConnectionStepDescription, 'context' | 'goals'>,
): WorkflowConnectionCandidateGroup[] {
  const { nodes } = description.context;
  const independent = description.goals.flatMap((goal) =>
    goal.decision.kind === 'independent'
      ? [new Set(goal.decision.nodeIds)]
      : [],
  );
  const separated = (left: string, right: string) =>
    left !== right &&
    independent.some((group) => group.has(left) && group.has(right));
  const groups = new Map<string, WorkflowConnectionCandidateGroup>();
  const successors = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  function requireBefore(before: string, after: string): void {
    const following = successors.get(before);
    if (!following || !successors.has(after))
      throw new Error(
        'Connection candidate precedence references an unknown node',
      );
    following.add(after);
  }
  for (const requirement of description.context.requiredPrecedence)
    requireBefore(requirement.before, requirement.after);
  for (const { decision } of description.goals) {
    if (decision.kind === 'precedence')
      requireBefore(decision.before, decision.after);
    if (decision.kind === 'route') requireBefore(decision.from, decision.to);
    if (decision.kind === 'join')
      for (const producer of decision.producerIds)
        requireBefore(producer, decision.nodeId);
  }
  function precedes(before: string, after: string): boolean {
    const pending = [before];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === after) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...successors.get(current)!);
    }
    return false;
  }
  for (const source of nodes.filter((node) => node.outputs.length)) {
    const targets: WorkflowConnectionPortCandidate[] = [];
    for (const target of nodes) {
      if (separated(source.id, target.id)) continue;
      if (source.id !== target.id && precedes(target.id, source.id)) continue;
      const inputs = target.inputs.filter((port) => {
        const reads = [
          ...(target.waitsForAllInputs
            ? []
            : target.references.map((ref) => ref.nodeId)),
          ...(target.waitsForAllInputs ? [] : target.dependencyNodeIds),
          ...(target.inputReferences?.[port] ?? []).map((ref) => ref.nodeId),
        ];
        // A normal incoming route cannot contain a required producer that is
        // explicitly independent of this source. An all-input join combines routes.
        return !reads.some((producer) => separated(source.id, producer));
      });
      if (inputs.length)
        targets.push({ id: target.id, inputs, outputs: [...target.outputs] });
    }
    if (!targets.length) continue;
    const key = JSON.stringify(
      targets.map((target) => [target.id, target.inputs]),
    );
    const group = groups.get(key);
    const candidate = {
      id: source.id,
      inputs: [...source.inputs],
      outputs: [...source.outputs],
    };
    if (group) group.sources.push(candidate);
    else groups.set(key, { sources: [candidate], targets });
  }
  return [...groups.values()];
}
