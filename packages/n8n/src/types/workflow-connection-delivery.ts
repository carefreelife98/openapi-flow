import type {
  WorkflowConnectionSessionInput,
  WorkflowConnectionDelivery,
  WorkflowConnectionDeliveryComponent,
} from '@openapi-flow/core';
import type { N8nNativeCapability } from './native-capability.js';
import type { N8nNodeFragment } from './node-fragment.js';
import type { N8nCompileResult } from './workflow-compilation.js';

export interface CompileWorkflowConnectionDeliveryInput extends Omit<
  WorkflowConnectionSessionInput,
  'capabilities' | 'materials'
> {
  id: string;
  name: string;
  capabilities: N8nNativeCapability[];
  materials: NonNullable<WorkflowConnectionSessionInput['materials']>;
  apiNodes: N8nNodeFragment[];
}

export interface N8nWorkflowConnectionDelivery {
  inspection: WorkflowConnectionDelivery;
  runnable: {
    nodeIds: WorkflowConnectionDeliveryComponent['nodeIds'];
    result: N8nCompileResult;
  }[];
  /** Accepted graph/settings and explicit blockers, not executable workflow JSON. */
  drafts: WorkflowConnectionDeliveryComponent[];
}

export type CreateWorkflowConnectionDeliveryApiNodesInput = Omit<
  CompileWorkflowConnectionDeliveryInput,
  'id' | 'name' | 'apiNodes'
>;
