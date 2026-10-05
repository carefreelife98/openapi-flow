import type { SequencePlan } from '@openapi-flow/core/internal';
export type {
  ResponseReference,
  SequenceStep,
  SequencePlan,
} from '@openapi-flow/core/internal';
import type { WorkflowJSON } from '@n8n/workflow-sdk';
import type {
  OpenApiDocument,
  ParsedDocument,
} from '@openapi-flow/core/internal';
import type { Operation } from '@openapi-flow/core/internal';
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

export interface SequenceRequest {
  spec: OpenApiDocument;
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
