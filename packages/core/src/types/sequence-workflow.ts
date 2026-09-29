import type { WorkflowJSON } from '@n8n/workflow-sdk';
import type { ParsedDocument } from './openapi.js';
import type { Operation } from './request.js';
import type {
  PreparedRequestBody,
  RequestHeader,
  ResolvedAuthentication,
} from './request-node.js';
import type {
  CompileRequest,
  CompileStatus,
  CredentialBindings,
  EffectPolicy,
  ExpectedBody,
  OperationEvidence,
} from './request-workflow.js';

export type PreviousOperations = Map<string, Operation>;
export type RequiredOutputs = Map<string, Set<string>>;

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

export interface PrepareSequenceInput {
  document: ParsedDocument;
  origin: URL;
  profile: SequenceRequest['profile'];
  effectPolicy: EffectPolicy;
  credentialBindings: CredentialBindings;
  plan: SequencePlan;
}

export interface PreparedSequence {
  evidence: SequenceEvidence[];
  missingInputs: string[];
  nodes: PreparedSequenceNode[];
  requiredOutputs: RequiredOutputs;
  blocked: boolean;
}

export interface BuildSequenceWorkflowInput {
  baseUrl: string;
  plan: SequencePlan;
  nodes: PreparedSequenceNode[];
  requiredOutputs: RequiredOutputs;
}
