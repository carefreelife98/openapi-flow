import type { WorkflowJSON } from '@n8n/workflow-sdk';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Operation, Scalar } from './openapi.js';

export type Primitive = Scalar;
export type ExpectedBody = Record<string, Primitive>;
export type WorkflowInputs = Record<string, Primitive | ExpectedBody>;
export type InputValues = Record<string, unknown>;
export type RequiredFields = Record<string, string>;
export type PreviousOperations = Map<string, Operation>;
export type RequiredOutputs = Map<string, Set<string>>;
export type CompileStatus = 'complete' | 'needs_input' | 'blocked';
export type OperationEvidence = Pick<
  Operation,
  'operationRef' | 'operationId' | 'method' | 'path' | 'status' | 'effect'
>;

export interface WorkflowPlan {
  version: '1';
  goal: string;
  operationRef: string;
  inputs?: WorkflowInputs;
  expectedBody?: ExpectedBody;
}

export interface CompileRequest {
  spec: unknown;
  baseUrl: string;
  profile: 'read-only' | 'test';
  plan: WorkflowPlan;
}

export type CompileOperationRequest = Pick<
  CompileRequest,
  'baseUrl' | 'profile' | 'plan'
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
  inputs?: Record<string, Primitive | ResponseReference | ExpectedBody>;
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
}

export interface GenerateRequest extends Omit<CompileRequest, 'plan'> {
  scenario: string;
  model: BaseChatModel;
}
