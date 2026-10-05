import type { WorkflowJSON } from '@n8n/workflow-sdk';
import type { N8nNodeFragment } from './node-fragment.js';

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
