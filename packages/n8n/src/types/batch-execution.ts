import type { z } from 'zod';
import type { batchExecutionScopeSchema } from '../schemas/batch-execution-schema.js';
import type { CompilePlannedN8nWorkflowInput } from './native-capability.js';
import type { N8nSdkNode, N8nNodeFragment } from './node-fragment.js';
import type { AssembleN8nWorkflowInput } from './workflow-compilation.js';

export type N8nBatchExecutionScope = z.infer<typeof batchExecutionScopeSchema>;
export interface CompileBatchedN8nWorkflowInput extends CompilePlannedN8nWorkflowInput {
  batchScopes: N8nBatchExecutionScope[];
}
export interface CreateBatchExecutionScopesInput extends AssembleN8nWorkflowInput {
  batchScopes: N8nBatchExecutionScope[];
}
export interface CompiledN8nBatchExecutionScope {
  scope: N8nBatchExecutionScope;
  controller: N8nSdkNode;
}
export interface ValidateBatchItemFlowInput {
  scope: N8nBatchExecutionScope;
  fragments: Map<string, N8nNodeFragment>;
  edges: AssembleN8nWorkflowInput['edges'];
  /** A completed earlier batch is not the original exit node's latest run. */
  otherBatchNodeIds: Set<string>;
}
