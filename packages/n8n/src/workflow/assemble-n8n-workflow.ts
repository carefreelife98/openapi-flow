import { trigger, workflow, validateWorkflow } from '@n8n/workflow-sdk';
import type {
  AssembleN8nWorkflowInput,
  N8nCompileResult,
} from '../types/workflow-compilation.js';

export function assembleN8nWorkflow({
  id,
  name,
  nodes,
  edges,
  starts,
}: AssembleN8nWorkflowInput): N8nCompileResult {
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    typeof name !== 'string' ||
    !name.trim()
  )
    throw new Error('workflow.id and workflow.name must be non-empty');
  if (
    !Array.isArray(nodes) ||
    nodes.length === 0 ||
    !Array.isArray(edges) ||
    !Array.isArray(starts) ||
    starts.length === 0
  )
    throw new Error('workflow requires nodes, edges and explicit starts');
  const byId = new Map(nodes.map((fragment) => [fragment.nodeId, fragment]));
  if (
    byId.size !== nodes.length ||
    nodes.some((fragment) => !fragment.nodeId.trim())
  )
    throw new Error('workflow nodes require unique non-empty nodeId');
  const sdkIds = nodes.flatMap((fragment) =>
    fragment.nodes.map((node) => node.id),
  );
  const sdkNames = nodes.flatMap((fragment) =>
    fragment.nodes.map((node) => node.name),
  );
  if (
    new Set(sdkIds).size !== sdkIds.length ||
    new Set(sdkNames).size !== sdkNames.length ||
    sdkNames.includes('Start') ||
    sdkIds.includes('openapi-flow-start')
  )
    throw new Error(
      'workflow SDK node IDs and names must be unique and not use the Start trigger identity',
    );
  for (const fragment of nodes)
    if (
      !fragment.nodes.includes(fragment.entry) ||
      !fragment.nodes.includes(fragment.exit) ||
      fragment.nodes.length !== 1
    )
      throw new Error(
        `node fragment ${fragment.nodeId} must describe one connected node; multi-node fragments need explicit internal connection support`,
      );
  const successors = new Map(
    nodes.map((fragment) => [fragment.nodeId, [] as string[]]),
  );
  const inbound = new Map(nodes.map((fragment) => [fragment.nodeId, 0]));
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    const source = byId.get(edge.from);
    const target = byId.get(edge.to);
    if (!source || !target)
      throw new Error(
        `edge ${edge.from} -> ${edge.to} references a missing node`,
      );
    if (
      !Object.hasOwn(source.outputPorts, edge.output) ||
      !Object.hasOwn(target.inputPorts, edge.input)
    )
      throw new Error(
        `edge ${edge.from} -> ${edge.to} references an undeclared port`,
      );
    const key = JSON.stringify(edge);
    if (edgeIds.has(key))
      throw new Error(`duplicate edge ${edge.from} -> ${edge.to}`);
    edgeIds.add(key);
    successors.get(edge.from)!.push(edge.to);
    inbound.set(edge.to, inbound.get(edge.to)! + 1);
  }
  const roots = [...inbound]
    .filter(([, count]) => count === 0)
    .map(([nodeId]) => nodeId);
  if (
    new Set(starts).size !== starts.length ||
    starts.some((nodeId) => !roots.includes(nodeId)) ||
    roots.some((nodeId) => !starts.includes(nodeId))
  )
    throw new Error('workflow.starts must identify every root exactly once');
  const pending = [...roots];
  let visited = 0;
  while (pending.length) {
    const current = pending.shift()!;
    visited++;
    for (const next of successors.get(current)!) {
      const count = inbound.get(next)! - 1;
      inbound.set(next, count);
      if (count === 0) pending.push(next);
    }
  }
  if (visited !== nodes.length) throw new Error('workflow DAG has a cycle');
  const start = trigger({
    type: 'n8n-nodes-base.manualTrigger',
    version: 1,
    config: { id: 'openapi-flow-start', name: 'Start', position: [0, 0] },
  });
  let built = workflow(id, name).add(start);
  for (const fragment of nodes)
    for (const node of fragment.nodes) built = built.add(node);
  for (const nodeId of starts)
    built = built.connect(start, 0, byId.get(nodeId)!.entry, 0);
  for (const edge of edges) {
    const source = byId.get(edge.from)!;
    const target = byId.get(edge.to)!;
    built = built.connect(
      source.exit,
      source.outputPorts[edge.output],
      target.entry,
      target.inputPorts[edge.input],
    );
  }
  const checked = validateWorkflow(built);
  if (!checked.valid)
    throw new Error(
      `n8n SDK validation failed: ${checked.errors.map((error) => error.message).join('; ')}`,
    );
  return { status: 'complete', workflow: built.toJSON() };
}
