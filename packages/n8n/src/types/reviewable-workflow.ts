import type {
  ReviewableWorkflowGraphPlan,
  ReviewableWorkflowApiMaterial,
  WorkflowReviewGap,
  ApiOperationContract,
} from '@openapi-flow/core';
import type { N8nNativeCapability } from './native-capability.js';
import type { N8nNodeFragment, N8nSdkNode } from './node-fragment.js';

export interface CompileReviewableN8nWorkflowInput {
  id: string;
  name: string;
  plan: ReviewableWorkflowGraphPlan;
  materials: ReviewableWorkflowApiMaterial[];
  apiNodes: N8nNodeFragment[];
  capabilities: N8nNativeCapability[];
}

export interface CreateGapNodeInput {
  nodeId: string;
  gaps: WorkflowReviewGap[];
  position: [number, number];
  operation?: ApiOperationContract;
}

export interface GapReviewRegionLayout {
  nodePosition: [number, number];
  notePosition: [number, number];
  width: number;
  height: number;
}

export interface GapReviewRegion {
  fragment: N8nNodeFragment;
  annotation: N8nSdkNode;
}
