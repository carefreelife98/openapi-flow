import type { WorkflowJSON } from '@n8n/workflow-sdk';
import type { N8nNodeFragment } from './node-fragment.js';
import type { N8nSdkNode } from './node-fragment.js';
import type { WorkflowReviewGap } from '@openapi-flow/core';
import type { N8nBatchExecutionScope } from './batch-execution.js';

export interface N8nGraphEdge {
  from: string;
  output: string;
  to: string;
  input: string;
}
export interface AssembleN8nWorkflowInput {
  id: string;
  name: string;
  nodes: N8nNodeFragment[];
  edges: N8nGraphEdge[];
  starts: string[];
}
export interface N8nCompileResult {
  status: 'complete';
  workflow: WorkflowJSON;
}

export interface BuildN8nWorkflowInput extends AssembleN8nWorkflowInput {
  triggerConnections: 'connected' | 'detached';
  annotations: N8nSdkNode[];
  batchScopes?: N8nBatchExecutionScope[];
}

export interface N8nWorkflowJSON extends WorkflowJSON {
  active?: false;
}

export interface N8nNeedsReviewResult {
  status: 'needs-review';
  workflow: N8nWorkflowJSON;
  diagnostics: WorkflowReviewGap[];
}

export type N8nWorkflowResult = N8nCompileResult | N8nNeedsReviewResult;
