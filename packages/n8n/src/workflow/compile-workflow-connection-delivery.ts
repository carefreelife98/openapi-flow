import { inspectWorkflowConnectionDelivery } from '@openapi-flow/core';
import type {
  CompileWorkflowConnectionDeliveryInput,
  N8nWorkflowConnectionDelivery,
} from '../types/workflow-connection-delivery.js';
import { compilePlannedN8nWorkflow } from './compile-planned-n8n-workflow.js';

/** Compile only dependency-closed, checked components; never adopt a rejected proposal as wiring. */
export function compileWorkflowConnectionDelivery(
  input: CompileWorkflowConnectionDeliveryInput,
): N8nWorkflowConnectionDelivery {
  if (!input.id.trim() || !input.name.trim())
    throw new Error('Connection delivery requires id and name');
  if (!Array.isArray(input.materials) || !Array.isArray(input.apiNodes))
    throw new Error(
      'Connection delivery requires explicit materials and apiNodes arrays',
    );
  const inspection = inspectWorkflowConnectionDelivery(input);
  const sourceIds = new Set(
    input.materials.flatMap((material) =>
      material.status === 'ready' ? [material.arguments.callId] : [],
    ),
  );
  if (
    new Set(input.apiNodes.map((node) => node.nodeId)).size !==
      input.apiNodes.length ||
    input.apiNodes.some((node) => !sourceIds.has(node.nodeId))
  )
    throw new Error(
      'Connection delivery apiNodes must be distinct ready source call IDs',
    );
  const runnable: N8nWorkflowConnectionDelivery['runnable'] = [];
  for (const [index, component] of inspection.components.entries()) {
    if (component.plan === undefined) continue;
    const ids = new Set(component.nodeIds);
    const result = compilePlannedN8nWorkflow({
      id: `${input.id}:${index + 1}`,
      name:
        inspection.status === 'complete'
          ? input.name
          : `${input.name} · ${index + 1}`,
      plan: component.plan,
      materials: input.materials.flatMap((material) =>
        material.status === 'ready' && ids.has(material.arguments.callId)
          ? [material]
          : [],
      ),
      apiNodes: input.apiNodes.filter((node) => ids.has(node.nodeId)),
      capabilities: input.capabilities,
    });
    runnable.push({ nodeIds: [...component.nodeIds], result });
  }
  return {
    inspection,
    runnable,
    drafts: inspection.components.filter(
      (component) => component.plan === undefined,
    ),
  };
}
