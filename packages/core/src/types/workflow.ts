import type { NodeConfig, WorkflowJSON } from '@n8n/workflow-sdk';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  InboundOperationCandidate,
  Operation,
  Scalar,
} from './openapi.js';

export type Primitive = Scalar;
export type ExpectedBody = Record<string, unknown>;
export type WorkflowInputs = Record<string, unknown>;
export type InputValues = Record<string, unknown>;
export type RequiredFields = Record<string, string>;
export type PreviousOperations = Map<string, Operation>;
export type RequiredOutputs = Map<string, Set<string>>;
export type CompileStatus = 'complete' | 'needs_input' | 'blocked';

export interface InboundPlan {
  version: '1';
  goal: string;
  operationRef: string;
  webhookPath: string;
  responseStatus: number;
  responseMediaType?: string;
  responseBody?: unknown;
}

export interface InboundRequest {
  spec: unknown;
  plan: InboundPlan;
}

export interface InboundResult {
  status: 'complete';
  plan: InboundPlan;
  evidence: InboundOperationCandidate;
  workflow: WorkflowJSON;
}
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
  'operationRef' | 'operationId' | 'method' | 'path'
> {
  effect: OperationEffect;
}

export interface WorkflowPlan {
  version: '1';
  goal: string;
  operationRef: string;
  inputs?: WorkflowInputs;
  requestMediaType?: string;
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
  inputs?: Record<string, unknown>;
  requestMediaType?: string;
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
  body?: PreparedRequestBody;
  headers: RequestHeader[];
  expectedBody: ExpectedBody;
  authentication?: ResolvedAuthentication;
}

export interface RequestHeader {
  name: string;
  value: string;
}

export interface PreparedRequestBody {
  contentType: 'json' | 'form-urlencoded';
  value: string;
}

export interface OperationNodeInput {
  operation: Operation;
  id: string;
  name: string;
  position: [number, number];
  url: string;
  body?: PreparedRequestBody;
  headers: RequestHeader[];
  authentication?: ResolvedAuthentication;
  shouldAssert: boolean;
}

export interface GenerateRequest extends Omit<CompileRequest, 'plan'> {
  scenario: string;
  model: BaseChatModel;
  requestMediaType?: string;
}
