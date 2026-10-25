import { validateWorkflowEdges } from '../../validate-workflow-edges.js';
import { analyzeWorkflowTopology } from '../../analyze-workflow-topology.js';
import type {
  InspectWorkflowConnectionGraphInput,
  InspectWorkflowConnectionGraphResult,
} from '../../../types/workflow-connection-session.js';

/** A missing connection stays open; only fully connected ancestral regions use final route proof. */
export function inspectConnectionGraph({
  contracts,
  graph,
  apiIds,
}: InspectWorkflowConnectionGraphInput): InspectWorkflowConnectionGraphResult {
  const result: InspectWorkflowConnectionGraphResult = {
    openBoundaries: [],
    pendingNodeIds: [],
    violations: [],
    routeStates: new Map(),
  };
  const nodes = new Map(contracts.map((node) => [node.id, node]));
  try {
    validateWorkflowEdges({ contracts, edges: graph.edges });
  } catch (error) {
    result.violations.push({
      code: 'INVALID_EDGE',
      message: error instanceof Error ? error.message : 'Invalid edge',
    });
    return result;
  }
  const incoming = new Map(
    contracts.map((node) => [
      node.id,
      graph.edges.filter((edge) => edge.to === node.id),
    ]),
  );
  const outgoing = new Map(
    contracts.map((node) => [
      node.id,
      graph.edges.filter((edge) => edge.from === node.id),
    ]),
  );
  if (
    new Set(graph.rootNodeIds).size !== graph.rootNodeIds.length ||
    new Set(graph.terminals.map((item) => JSON.stringify(item))).size !==
      graph.terminals.length
  )
    result.violations.push({
      code: 'INVALID_BOUNDARY',
      message: 'Root and terminal decisions must be distinct',
    });
  for (const id of graph.rootNodeIds) {
    const node = nodes.get(id);
    if (
      !node ||
      incoming.get(id)!.length ||
      node.waitsForAllInputs ||
      node.rejoinsExclusiveOutputs !== undefined ||
      node.references.length ||
      node.dependencyNodeIds.length ||
      Object.values(node.inputReferences ?? {}).some((refs) => refs.length)
    )
      result.violations.push({
        code: 'INVALID_BOUNDARY',
        message: `Node ${id} cannot be an independent root`,
      });
  }
  for (const item of graph.terminals) {
    const node = nodes.get(item.nodeId);
    if (
      !node ||
      !node.outputs.includes(item.output) ||
      outgoing.get(item.nodeId)!.some((edge) => edge.output === item.output)
    )
      result.violations.push({
        code: 'INVALID_BOUNDARY',
        message: `Terminal ${item.nodeId}/${item.output} is absent or connected`,
      });
  }
  const pending = new Set(nodes.keys());
  const ordered: string[] = [];
  while (pending.size) {
    const next = [...pending].find((id) =>
      incoming.get(id)!.every((edge) => !pending.has(edge.from)),
    );
    if (next === undefined) {
      result.violations.push({
        code: 'CYCLE',
        message: 'Connection graph contains a cycle',
      });
      return result;
    }
    pending.delete(next);
    ordered.push(next);
  }
  const closed = new Set<string>();
  for (const id of ordered) {
    const node = nodes.get(id)!;
    const inputs = incoming.get(id)!;
    const root = graph.rootNodeIds.includes(id);
    const missing = node.inputs.filter(
      (port) => !inputs.some((edge) => edge.input === port) && !root,
    );
    for (const port of missing)
      result.openBoundaries.push({ nodeId: id, direction: 'input', port });
    // Even an input-less node must be explicitly placed rather than silently becoming a root.
    if (!inputs.length && !root && !missing.length)
      result.openBoundaries.push({ nodeId: id, direction: 'input', port: '' });
    for (const port of node.outputs)
      if (
        !outgoing.get(id)!.some((edge) => edge.output === port) &&
        !graph.terminals.some(
          (item) => item.nodeId === id && item.output === port,
        )
      )
        result.openBoundaries.push({ nodeId: id, direction: 'output', port });
    if (
      !missing.length &&
      (inputs.length || root) &&
      inputs.every((edge) => closed.has(edge.from))
    )
      closed.add(id);
    else result.pendingNodeIds.push(id);
  }
  if (closed.size) {
    try {
      result.routeStates = analyzeWorkflowTopology({
        contracts: contracts.filter((node) => closed.has(node.id)),
        edges: graph.edges.filter(
          (edge) => closed.has(edge.from) && closed.has(edge.to),
        ),
        starts: graph.rootNodeIds.filter((id) => closed.has(id)),
        apiIds,
      });
    } catch (error) {
      result.violations.push({
        code: 'CLOSED_REGION_INVALID',
        message:
          error instanceof Error ? error.message : 'Invalid closed region',
      });
    }
  }
  return result;
}
