import type { CredentialBindings } from './legacy/request-workflow.js';
import type { HttpRequestAuthenticationMapping } from './authentication.js';

export interface HttpRequestDeploymentOptions {
  baseUrl?: string;
  credentialBindings?: CredentialBindings;
  securityRequirementIndex?: number;
}

export interface ResolveHttpRequestDeploymentInput extends HttpRequestDeploymentOptions {
  documentId: string;
  authentication?: HttpRequestAuthenticationMapping;
}

export interface ResolvedHttpRequestDeployment {
  baseUrl: string;
  credentialBindings: CredentialBindings;
  pendingFields: string[];
  authentication?: HttpRequestAuthenticationMapping;
}
