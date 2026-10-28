import type { CredentialBindings } from './legacy/request-workflow.js';
import type { HttpRequestAuthenticationMapping } from './authentication.js';
import type { ApiOperationContract } from '@openapi-flow/core';

export interface ResolvedOasServerAddress {
  baseUrl: string;
  requiresHost: boolean;
}

export type ResolveOasServerAddressInput = Pick<
  ApiOperationContract,
  'effective'
>;

export interface HttpRequestDeploymentOptions {
  baseUrl?: string;
  credentialBindings?: CredentialBindings;
  securityRequirementIndex?: number;
}

export interface ResolveHttpRequestDeploymentInput extends HttpRequestDeploymentOptions {
  documentId: string;
  authentication?: HttpRequestAuthenticationMapping;
  oasServerAddress: ResolvedOasServerAddress;
}

export interface ResolvedHttpRequestDeployment {
  baseUrl: string;
  credentialBindings: CredentialBindings;
  pendingFields: string[];
  authentication?: HttpRequestAuthenticationMapping;
}
