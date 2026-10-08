import type { ValidateWorkflowEdgesInput } from '../types/workflow-plan.js';

export function validateWorkflowEdges({
  contracts,
  edges,
}: ValidateWorkflowEdgesInput): void {
  const nodes = new Map(contracts.map((item) => [item.id, item]));
  if (
    nodes.size !== contracts.length ||
    contracts.some((item) => !item.id.trim())
  )
    throw new Error('plan node IDs must be unique and non-empty');
  const edgeKeys = new Set<string>();
  for (const edge of edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) throw new Error('plan edge references a missing node');
    if (!from.outputs.includes(edge.output) || !to.inputs.includes(edge.input))
      throw new Error(
        `plan edge ${edge.from} -> ${edge.to} has an unknown port`,
      );
    const key = JSON.stringify([edge.from, edge.output, edge.to, edge.input]);
    if (edgeKeys.has(key)) throw new Error('plan has duplicate edges');
    edgeKeys.add(key);
  }
}
