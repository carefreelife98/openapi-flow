import type { ExpectedBody, WorkflowPlan } from '@openapi-flow/core/internal';
export type {
  ExpectedBody,
  WorkflowInputs,
  InputValues,
  WorkflowPlan,
} from '@openapi-flow/core/internal';
import type { WorkflowJSON } from '@n8n/workflow-sdk';
import type { OpenApiDocument } from '@openapi-flow/core/internal';
import type { Operation } from '@openapi-flow/core/internal';
import type {
  PreparedRequestBody,
  RequestHeader,
  ResolvedAuthentication,
} from './request-node.js';

export type CompileStatus = 'complete' | 'needs_input' | 'blocked';

export type OperationEffect = 'read' | 'write' | 'unknown';
export type EffectPolicy = Record<string, 'read' | 'write'>;
export interface CredentialBinding {
  id: string;
  name: string;
}
export type CredentialBindings = Record<string, CredentialBinding>;
export interface OperationEvidence extends Pick<
  Operation,
  'operationRef' | 'operationId' | 'method' | 'path'
> {
  effect: OperationEffect;
}

export interface CompileRequest {
  spec: OpenApiDocument;
  baseUrl: string;
  profile: 'read-only' | 'test';
  effectPolicy: EffectPolicy;
  credentialBindings: CredentialBindings;
  plan: WorkflowPlan;
}

export type CompileOperationRequest = Pick<
  CompileRequest,
  'baseUrl' | 'profile' | 'effectPolicy' | 'credentialBindings' | 'plan'
>;

export interface CompileResult {
  status: CompileStatus;
  plan: WorkflowPlan;
  evidence: OperationEvidence;
  missingInputs: string[];
  workflow?: WorkflowJSON;
}

export interface BuildRequestWorkflowInput {
  baseUrl: string;
  plan: WorkflowPlan;
  operation: Operation;
  url: string;
  body?: PreparedRequestBody;
  headers: RequestHeader[];
  authentication?: ResolvedAuthentication;
  expectedBody: ExpectedBody;
}
