import type { CompilePlannedN8nWorkflowInput } from '../types/native-capability.js';
import type { N8nCompileResult } from '../types/workflow-compilation.js';
import { assembleN8nWorkflow } from './assemble-n8n-workflow.js';
import { compileValidatedWorkflowFragments } from './compile-validated-workflow-fragments.js';

export function compilePlannedN8nWorkflow(
  input: CompilePlannedN8nWorkflowInput,
): N8nCompileResult {
  const nodes = compileValidatedWorkflowFragments(input);
  const result = assembleN8nWorkflow({
    id: input.id,
    name: input.name,
    nodes,
    edges: input.plan.edges,
    starts: input.plan.starts,
  });
  result.workflow.settings = {
    ...result.workflow.settings,
    executionOrder: 'v1',
  };
  return result;
}
