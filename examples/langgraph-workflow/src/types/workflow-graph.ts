import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { CreateHttpRequestNodeInput } from '@openapi-flow/n8n';
import type {
  ApiSelection,
  ApiOperationContract,
  ApiCallArguments,
} from '@openapi-flow/core';
import type { N8nNodeFragment, N8nGraphEdge } from '@openapi-flow/n8n';
import type { workflowStateSchema } from '../schemas/workflow-state-schema.js';
import type { WorkflowGraphPlan } from '@openapi-flow/core';
import type { N8nNativeCapability } from '@openapi-flow/n8n';

export type WorkflowState = typeof workflowStateSchema.State;
export type WorkflowUpdate = typeof workflowStateSchema.Update;

export interface ServiceDeployment {
  documentId: string;
  baseUrl: string;
  credentialBindings: CreateHttpRequestNodeInput['credentialBindings'];
}

export interface GraphDependencies {
  model: BaseChatModel;
  deployments: ServiceDeployment[];
}

export interface ApiPreparationDependencies extends GraphDependencies {
  reviewSelection?: (selection: ApiSelection) => void;
}

export interface PlannedGraphDependencies extends ApiPreparationDependencies {
  capabilities: N8nNativeCapability[];
  reviewPlan?: (plan: WorkflowGraphPlan) => void | Promise<void>;
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
