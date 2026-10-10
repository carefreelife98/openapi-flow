import type { CompileBatchedN8nWorkflowInput } from '../../types/batch-execution.js';
import type { N8nCompileResult } from '../../types/workflow-compilation.js';
import { batchExecutionScopesSchema } from '../../schemas/batch-execution-schema.js';
import { compileValidatedWorkflowFragments } from '../compile-validated-workflow-fragments.js';
import { buildN8nWorkflow } from '../build-n8n-workflow.js';

export function compileBatchedN8nWorkflow(
  input: CompileBatchedN8nWorkflowInput,
): N8nCompileResult {
  const batchScopes = batchExecutionScopesSchema.parse(input.batchScopes);
  const workflow = buildN8nWorkflow({
    id: input.id,
    name: input.name,
    nodes: compileValidatedWorkflowFragments(input),
    edges: input.plan.edges,
    starts: input.plan.starts,
    triggerConnections: 'connected',
    annotations: [],
    batchScopes,
  });
  workflow.settings = { ...workflow.settings, executionOrder: 'v1' };
  return { status: 'complete', workflow };
}
