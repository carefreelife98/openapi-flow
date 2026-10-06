import type { Operation } from '@openapi-flow/core/internal';
import type { CredentialBindings } from './legacy/request-workflow.js';

export interface HttpRequestDeploymentOptions {
  baseUrl?: string;
  credentialBindings?: CredentialBindings;
}

export interface ResolveHttpRequestDeploymentInput extends HttpRequestDeploymentOptions {
  documentId: string;
  operation: Operation;
}

export interface ResolvedHttpRequestDeployment {
  baseUrl: string;
  credentialBindings: CredentialBindings;
  pendingFields: string[];
}
