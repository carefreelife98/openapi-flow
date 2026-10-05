import type { WorkflowJSON } from '@n8n/workflow-sdk';
import type {
  CatalogSource,
  CatalogSequencePlan,
  CatalogDiagnostic,
} from '@openapi-flow/core/internal';
import type { Operation } from '@openapi-flow/core/internal';
import type {
  CredentialBindings,
  EffectPolicy,
} from '@openapi-flow/n8n/legacy';
import type {
  SequenceEvidence,
  SequencePlan,
  SequenceStep,
} from '@openapi-flow/n8n/legacy';
import type { CompileRequest } from '@openapi-flow/n8n/legacy';

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

export interface N8nCatalogSource extends CatalogSource {
  baseUrl: string;
  effectPolicy: EffectPolicy;
  credentialBindings: CredentialBindings;
}

export interface CatalogSequenceRequest {
  sources: N8nCatalogSource[];
  profile: CompileRequest['profile'];
  plan: CatalogSequencePlan;
}

export interface CatalogSequenceEvidence extends SequenceEvidence {
  documentId: string;
}

export interface CatalogSequenceResult {
  status: 'complete' | 'needs_capability' | 'needs_input' | 'blocked';
  plan: CatalogSequencePlan;
  evidence: CatalogSequenceEvidence[];
  diagnostics: CatalogDiagnostic[];
  workflow?: WorkflowJSON;
}
