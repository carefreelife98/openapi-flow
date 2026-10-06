import type {
  AssembleN8nWorkflowInput,
  N8nCompileResult,
} from '../types/workflow-compilation.js';
import { buildN8nWorkflow } from './build-n8n-workflow.js';

export function assembleN8nWorkflow(
  input: AssembleN8nWorkflowInput,
): N8nCompileResult {
  return {
    status: 'complete',
    workflow: buildN8nWorkflow({
      ...input,
      triggerConnections: 'connected',
      annotations: [],
    }),
  };
}
