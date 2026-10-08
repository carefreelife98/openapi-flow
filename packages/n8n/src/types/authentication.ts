import type { ApiOperationContract } from '@openapi-flow/core';

export type HttpRequestCredentialType =
  | 'httpBearerAuth'
  | 'httpBasicAuth'
  | 'httpDigestAuth'
  | 'httpHeaderAuth'
  | 'httpQueryAuth'
  | 'oAuth2Api';

export interface HttpRequestAuthenticationMapping {
  schemeName: string;
  credentialType: HttpRequestCredentialType;
  credentialRequirements?: string;
}

export interface ResolveHttpRequestAuthenticationInput {
  operation: ApiOperationContract;
  securityRequirementIndex?: number;
}

export interface CredentialBindingRequest {
  authentication?: HttpRequestAuthenticationMapping;
}
