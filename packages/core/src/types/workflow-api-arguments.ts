import type { ApiLiteralGenerationInput } from './api-literal-generation.js';
import type { ApiCallArguments, JsonValue } from './api-arguments.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';
import type { ApiInputMessageSourceCatalog } from './api-input-source-selection.js';
import type { VerifiedApiLiteralProposalSource } from './api-input-literal-source.js';
import type {
  BindingPointerTemplate,
  BindingPointerSelections,
} from './api-binding-candidates.js';

/** Original messages and lexical spans are prepared once for a planning revision. */
export interface WorkflowInputCatalog {
  fingerprint: string;
  messages: WorkflowSourceMessage[];
  sources: ApiInputMessageSourceCatalog[];
}

/** Each source ID belongs to one code-owned original message and lexical region. */
export type WorkflowInputSelection =
  | { kind: 'json'; sourceId: string }
  | {
      kind: 'text';
      sourceId: string;
      startTokenId: string;
      endTokenId: string;
    };

export interface VerifiedWorkflowInput {
  id: string;
  value: JsonValue;
  source: Omit<VerifiedApiLiteralProposalSource, 'targetPointer'>;
}

export interface WorkflowApiArgumentAssignment {
  targetId: string;
  targetSelections: BindingPointerSelections;
  source: WorkflowInputSelection;
}

export interface WorkflowApiArgumentTarget {
  id: string;
  template: BindingPointerTemplate;
}

export interface WorkflowApiArgumentCallPlan {
  assignments: WorkflowApiArgumentAssignment[];
  requestedInputs: string[];
  reason?: string;
}

/** Input selections are shared; calls reference them instead of rewriting evidence. */
export interface WorkflowApiArgumentPlan {
  sourceFingerprint: string;
  calls: Record<string, WorkflowApiArgumentCallPlan>;
}

/** The model never generates a source fingerprint; the caller attaches its checked revision. */
export type WorkflowApiArgumentPlanProposal = Omit<
  WorkflowApiArgumentPlan,
  'sourceFingerprint'
>;

export type WorkflowApiArgumentCallInput = Omit<
  ApiLiteralGenerationInput,
  'scenario' | 'literalSourceMessages'
>;

export interface WorkflowApiArgumentContext {
  scenario: string;
  catalog: WorkflowInputCatalog;
  calls: WorkflowApiArgumentCallInput[];
}

export interface WorkflowApiArgumentRejection {
  callId: string;
  reason: string;
  /** Identity of this one call's exact source, role, OAS and bindings. */
  sourceFingerprint: string;
}

export interface CompiledWorkflowApiArguments {
  sourceFingerprint: string;
  plan: WorkflowApiArgumentPlan;
  inputs: VerifiedWorkflowInput[];
  arguments: ApiCallArguments[];
  rejections: WorkflowApiArgumentRejection[];
}

export interface ValidateCompiledWorkflowApiArgumentsInput extends WorkflowApiArgumentContext {
  result: CompiledWorkflowApiArguments;
}

export interface CompileWorkflowApiArgumentsInput extends WorkflowApiArgumentContext {
  plan: WorkflowApiArgumentPlan;
}
