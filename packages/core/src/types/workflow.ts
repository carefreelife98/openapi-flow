import type { NodeConfig, WorkflowJSON } from '@n8n/workflow-sdk';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Operation, Scalar } from './openapi.js';

export type Primitive = Scalar;
export type ExpectedBody = Record<string, unknown>;
export type WorkflowInputs = Record<string, unknown>;
export type InputValues = Record<string, unknown>;
export type RequiredFields = Record<string, string>;
export type PreviousOperations = Map<string, Operation>;
export type RequiredOutputs = Map<string, Set<string>>;
export type CompileStatus = 'complete' | 'needs_input' | 'blocked';
export type OperationEffect = 'read' | 'write' | 'unknown';
export type EffectPolicy = Record<string, 'read' | 'write'>;
export interface CredentialBinding {
  id: string;
  name: string;
}
export type CredentialBindings = Record<string, CredentialBinding>;
export type ResolvedAuthentication = Required<
  Pick<NodeConfig, 'parameters' | 'credentials'>
>;
export interface OperationEvidence extends Pick<
  Operation,
  'operationRef' | 'operationId' | 'method' | 'path' | 'status'
> {
  effect: OperationEffect;
}

export interface WorkflowPlan {
  version: '1';
  goal: string;
  operationRef: string;
  expectedStatus?: number;
  inputs?: WorkflowInputs;
  expectedBody?: ExpectedBody;
}

export interface CompileRequest {
  spec: unknown;
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

export interface ResponseReference {
  fromStep: string;
  field: string;
}

export interface SequenceStep {
  id: string;
  operationRef: string;
  expectedStatus?: number;
  inputs?: Record<string, unknown>;
  expectedBody?: ExpectedBody;
}

export interface SequencePlan {
  version: '1';
  goal: string;
  steps: SequenceStep[];
}

export interface SequenceRequest {
  spec: unknown;
  baseUrl: string;
  profile: CompileRequest['profile'];
  effectPolicy: EffectPolicy;
  credentialBindings: CredentialBindings;
  plan: SequencePlan;
}

export interface SequenceEvidence extends OperationEvidence {
  stepId: string;
}

export interface SequenceResult {
  status: CompileStatus;
  plan: SequencePlan;
  evidence: SequenceEvidence[];
  missingInputs: string[];
  workflow?: WorkflowJSON;
}

export interface PreparedSequenceNode {
  operation: Operation;
  id: string;
  url: string;
  body?: string;
  expectedBody: ExpectedBody;
  expectedStatus?: number;
  authentication?: ResolvedAuthentication;
}

export interface GenerateRequest extends Omit<CompileRequest, 'plan'> {
  scenario: string;
  model: BaseChatModel;
}
