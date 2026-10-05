import type { WorkflowJSON } from '@n8n/workflow-sdk';
import type { CatalogSource } from './catalog.js';
import type { Operation } from './request.js';
import type { CredentialBindings, EffectPolicy } from './request-workflow.js';
import type {
  SequenceEvidence,
  SequencePlan,
  SequenceStep,
} from './sequence-workflow.js';
import type { CompileRequest } from './request-workflow.js';

export interface ResolvedSequenceStep {
  operation: Operation;
  origin: URL;
  effectPolicy: EffectPolicy;
  credentialBindings: CredentialBindings;
}

export interface PrepareStepsInput {
  profile: CompileRequest['profile'];
  plan: SequencePlan;
  resolveStep: (step: SequenceStep) => ResolvedSequenceStep;
}

export interface CatalogStep extends SequenceStep {
  documentId: string;
}

export interface CapabilityGap {
  kind: 'missing_operation' | 'insufficient_contract';
  description: string;
  documentId?: string;
  operationRef?: string;
}

export interface CatalogSequencePlan extends Omit<SequencePlan, 'steps'> {
  steps: CatalogStep[];
  gaps?: CapabilityGap[];
}

export interface CatalogSequenceRequest {
  sources: CatalogSource[];
  profile: CompileRequest['profile'];
  plan: CatalogSequencePlan;
}

export interface CatalogSequenceEvidence extends SequenceEvidence {
  documentId: string;
}

export interface CatalogDiagnostic {
  code:
    | 'missing_operation'
    | 'insufficient_contract'
    | 'missing_input'
    | 'effect_not_approved';
  message: string;
  stepId?: string;
  documentId?: string;
  operationRef?: string;
}

export interface CatalogSequenceResult {
  status: 'complete' | 'needs_capability' | 'needs_input' | 'blocked';
  plan: CatalogSequencePlan;
  evidence: CatalogSequenceEvidence[];
  diagnostics: CatalogDiagnostic[];
  workflow?: WorkflowJSON;
}
