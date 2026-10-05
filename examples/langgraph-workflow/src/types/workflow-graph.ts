import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { CreateHttpRequestNodeInput } from '@openapi-flow/n8n';
import type { workflowStateSchema } from '../schemas/workflow-state-schema.js';

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
