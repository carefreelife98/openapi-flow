export type ExpectedBody = Record<string, unknown>;

export type WorkflowInputs = Record<string, unknown>;

export type InputValues = Record<string, unknown>;

export interface WorkflowPlan {
  version: '1';
  goal: string;
  operationRef: string;
  inputs?: WorkflowInputs;
  requestMediaType?: string;
  expectedBody?: ExpectedBody;
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
