import { validateWorkflowGraphPlan } from '@openapi-flow/core';
import type { CompilePlannedN8nWorkflowInput } from '../types/native-capability.js';
import type { N8nCompileResult } from '../types/workflow-compilation.js';
import { assembleN8nWorkflow } from './assemble-n8n-workflow.js';

export function compilePlannedN8nWorkflow(
  input: CompilePlannedN8nWorkflowInput,
): N8nCompileResult {
  if (input.plan.gaps.length)
    throw new Error(
      `Workflow needs review: ${JSON.stringify(input.plan.gaps)}`,
    );
  validateWorkflowGraphPlan(input);
  const expectedIds = input.materials
    .map((item) => item.arguments.callId)
    .sort();
  const actualIds = input.apiNodes.map((item) => item.nodeId).sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds))
    throw new Error('apiNodes must match material callIds exactly');
  const names = Object.fromEntries(
    input.apiNodes.map((item) => [item.nodeId, item.exit.name]),
  );
  const nativeNodes = input.plan.nativeNodes.map((planned, index) => {
    const capability = input.capabilities.find(
      (item) => item.name === planned.capability,
    );
    if (!capability)
      throw new Error(`Missing native compiler ${planned.capability}`);
    const compiled = capability.compile({
      planned,
      apiNodeNames: names,
      position: [600 + index * 250, 300],
    });
    if (
      compiled.nodeId !== planned.id ||
      JSON.stringify(Object.keys(compiled.inputPorts)) !==
        JSON.stringify(capability.inputPorts(planned.parameters)) ||
      JSON.stringify(Object.keys(compiled.outputPorts)) !==
        JSON.stringify(capability.outputPorts(planned.parameters))
    )
      throw new Error(
        `Native compiler ${planned.capability} violated declared node identity/ports`,
      );
    return compiled;
  });
  const result = assembleN8nWorkflow({
    id: input.id,
    name: input.name,
    nodes: [...input.apiNodes, ...nativeNodes],
    edges: input.plan.edges,
    starts: input.plan.starts,
  });
  result.workflow.settings = {
    ...result.workflow.settings,
    executionOrder: 'v1',
  };
  return result;
}
