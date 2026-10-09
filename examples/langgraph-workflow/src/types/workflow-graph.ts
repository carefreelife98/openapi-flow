import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { HttpRequestDeploymentOptions } from '@openapi-flow/n8n';
import type {
  ApiSelection,
  ApiOperationContract,
  ApiCallArguments,
  ApiBindingPlan,
  PlannedNativeNode,
} from '@openapi-flow/core';
import type { N8nNodeFragment, N8nGraphEdge } from '@openapi-flow/n8n';
import type { workflowStateSchema } from '../schemas/workflow-state-schema.js';
import type { WorkflowGraphPlan } from '@openapi-flow/core';
import type { N8nNativeCapability } from '@openapi-flow/n8n';

export type WorkflowState = typeof workflowStateSchema.State;
export type WorkflowUpdate = typeof workflowStateSchema.Update;

export interface ResolvedApiRequestMediaType {
  callId: string;
  requestMediaType?: string;
}

export interface ServiceDeployment extends HttpRequestDeploymentOptions {
  documentId: string;
}

export interface GraphDependencies {
  model: BaseChatModel;
  deployments?: ServiceDeployment[];
}

export interface ApiPreparationDependencies extends GraphDependencies {
  /** Explicit per-call linked item execution; single-item requests are unchanged. */
  linkedItemCallIds?: string[];
  reviewSelection?: (selection: ApiSelection) => void;
  reviewBindings?: (plan: ApiBindingPlan) => void | Promise<void>;
}

export interface PlannedGraphDependencies extends ApiPreparationDependencies {
  capabilities: N8nNativeCapability[];
  reviewPlan?: (plan: WorkflowGraphPlan) => void | Promise<void>;
  preparedNativeNodes?: PlannedNativeNode[];
}

export interface OrchestratedGraphDependencies extends Omit<
  PlannedGraphDependencies,
  'capabilities'
> {
  capabilities?: N8nNativeCapability[];
}

export interface ResolvedRequestNode {
  operation: ApiOperationContract;
  arguments: ApiCallArguments;
  fragment: N8nNodeFragment;
}

export interface HostDagTopology {
  nodes: N8nNodeFragment[];
  edges: N8nGraphEdge[];
  starts: string[];
}

export interface DagGraphDependencies extends GraphDependencies {
  reviewSelection: (selection: ApiSelection) => void;
  composeDag: (requests: ResolvedRequestNode[]) => HostDagTopology;
}
