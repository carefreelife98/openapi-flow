import type { z } from 'zod';
import type { JsonValue } from './api-arguments.js';
import type { BindingSchema, ApiBindingMaterial } from './api-bindings.js';
import type { WorkflowMessageEvidence } from './planning-evidence.js';
import type { WorkflowDecisionExplanation } from './workflow-clarification.js';
import type { ValidateWorkflowDraftEditPlanInput } from './workflow-draft-edit.js';
import type {
  WorkflowDraftEditResolution,
  WorkflowDraftEditRepair,
} from './workflow-draft-edit-assembly.js';
import type { ApiOperationContract } from './api-operation.js';
import type {
  WorkflowDraftApiCall,
  WorkflowSourceMessage,
} from './workflow-draft.js';
import type { JsonObject } from './openapi.js';
import type { ApiInputLiteralSource } from './api-input-literal-source.js';
import type { ApiInputAnswerAnalysis } from './api-input-answer-extraction.js';
import type {
  WorkflowDraftApiEnumSelection,
  VerifiedWorkflowDraftApiEnumSelection,
} from './workflow-draft-api-enum-selection.js';
import type {
  workflowDraftApiInputEditAnswerSchema,
  workflowDraftApiInputEditAnswersSchema,
} from '../schemas/workflow-draft-api-input-edit-answers-schema.js';

export interface WorkflowDraftApiInputEditMaterial extends ApiBindingMaterial {
  requestedInputs?: string[];
}

export interface WorkflowDraftApiInputEditInput extends ValidateWorkflowDraftEditPlanInput {
  stepId: string;
  /** Explicit completed materials in this same plan. Omission means none. */
  resolutions?: WorkflowDraftEditResolution[];
  repairs?: WorkflowDraftEditRepair[];
  /** Omission preserves the call's explicit existing media selection. */
  requestMediaType?: string;
}
export interface ProposedWorkflowDraftApiInputEditTarget {
  kind: 'set' | 'remove';
  pointer: string;
  sources: WorkflowMessageEvidence[];
  explanation?: WorkflowDecisionExplanation<WorkflowMessageEvidence>;
}
export interface WorkflowDraftApiInputEditProposal {
  targets: ProposedWorkflowDraftApiInputEditTarget[];
}
export type WorkflowDraftApiInputEditTarget = Omit<
  ProposedWorkflowDraftApiInputEditTarget,
  'kind'
> & { id: string } & (
    { kind: 'set'; schema: BindingSchema } | { kind: 'remove' }
  );
export interface WorkflowDraftApiInputEditDescription {
  stageFingerprint: string;
  stepId: string;
  instruction: string;
  call: WorkflowDraftApiCall;
  operation: ApiOperationContract;
  requestSchema: JsonObject;
  messages: WorkflowSourceMessage[];
  includeExplanations: boolean;
}
export interface CreateWorkflowDraftApiInputEditContractInput extends WorkflowDraftApiInputEditInput {
  proposal: WorkflowDraftApiInputEditProposal;
}
export interface WorkflowDraftApiInputEditContract {
  id: string;
  planId: string;
  stepId: string;
  nodeId: string;
  /** Shared original request resource; field schemas refer to it, never duplicate it. */
  schemaResource: BindingSchema;
  targets: WorkflowDraftApiInputEditTarget[];
  requestMediaType?: string;
}
export interface WorkflowDraftApiInputEditContractInput extends WorkflowDraftApiInputEditInput {
  contract: WorkflowDraftApiInputEditContract;
  /** Enable ID-only interpretation of declared OAS enum choices, with separate provenance. */
  selectOasEnums?: boolean;
}
export interface WorkflowDraftApiInputEditValueSource extends ApiInputLiteralSource {
  messageId: string;
}
export type WorkflowDraftApiInputEditValue = (
  | {
      status: 'provided';
      value: JsonValue;
      source: WorkflowDraftApiInputEditValueSource;
    }
  | { status: 'needs-input' }
  | { status: 'oas-enum'; selection: WorkflowDraftApiEnumSelection }
) & {
  explanation?: WorkflowDecisionExplanation<WorkflowMessageEvidence>;
};
export interface WorkflowDraftApiInputEditValues {
  values: Record<string, WorkflowDraftApiInputEditValue>;
}
export type WorkflowDraftApiInputEditAnswer = z.infer<
  typeof workflowDraftApiInputEditAnswerSchema
>;
export type WorkflowDraftApiInputEditAnswers = z.infer<
  typeof workflowDraftApiInputEditAnswersSchema
>;
export interface WorkflowDraftApiInputEditAnswerSchemaInput extends WorkflowDraftApiInputEditContractInput {
  output: WorkflowDraftApiInputEditValues;
}
export interface ResolveWorkflowDraftApiInputEditsInput extends WorkflowDraftApiInputEditAnswerSchemaInput {
  /** Validated user answer values, separate from the unchanged model output. Retain natural-answer analysis independently. */
  confirmedAnswers?: WorkflowDraftApiInputEditAnswers;
}
export interface ResolveWorkflowDraftApiInputEditReplyInput extends ResolveWorkflowDraftApiInputEditsInput {
  reply: string;
  analysis: ApiInputAnswerAnalysis;
}
export type WorkflowDraftApiInputEditResult = (
  | {
      status: 'ready';
      contractId: string;
      values: WorkflowDraftApiInputEditValues;
      resolution: Extract<WorkflowDraftEditResolution, { kind: 'api-inputs' }>;
    }
  | {
      status: 'needs-input';
      contractId: string;
      values: WorkflowDraftApiInputEditValues;
      pendingTargets: WorkflowDraftApiInputEditTarget[];
    }
) & {
  /** Present when validated user answer values were supplied; natural provenance belongs to the separate answer analysis. */
  confirmedAnswers?: WorkflowDraftApiInputEditAnswers;
  /** Original OAS values and human intent, not user-provided literal attribution. */
  enumSelections?: VerifiedWorkflowDraftApiEnumSelection[];
};
export type WorkflowDraftApiInputEditValuesSchema =
  z.ZodType<WorkflowDraftApiInputEditValues>;
export type WorkflowDraftApiInputEditAnswersSchema =
  z.ZodType<WorkflowDraftApiInputEditAnswers>;
