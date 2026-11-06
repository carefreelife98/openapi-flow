import type {
  ApiArgumentProposal,
  ApiCallArguments,
  JsonValue,
} from './api-arguments.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';
import type {
  WorkflowApiArgumentContext,
  WorkflowApiArgumentRejection,
} from './workflow-api-arguments.js';
import type { VerifiedApiLiteralProposalSource } from './api-input-literal-source.js';

export type WorkflowApiValueContext = Omit<
  WorkflowApiArgumentContext,
  'catalog'
> & {
  messages: WorkflowSourceMessage[];
  /** Permit model interpretation of declared enums, booleans and null; never defaults or examples. */
  interpretSchemaChoices: boolean;
};
export interface WorkflowApiValueCallPlan extends ApiArgumentProposal {
  requestedInputs: string[];
}
export interface WorkflowApiValuePlan {
  sourceFingerprint: string;
  calls: Record<string, WorkflowApiValueCallPlan>;
}
export type WorkflowApiValueProposal = Omit<
  WorkflowApiValuePlan,
  'sourceFingerprint'
>;
export interface WorkflowApiSchemaSelection {
  targetPointer: string;
  value: JsonValue;
}
export interface ApiValueEvidence {
  literalSources: VerifiedApiLiteralProposalSource[];
  schemaSelections: WorkflowApiSchemaSelection[];
}
export interface CompiledWorkflowApiValues {
  sourceFingerprint: string;
  plan: WorkflowApiValuePlan;
  arguments: ApiCallArguments[];
  evidence: Record<string, ApiValueEvidence>;
  rejections: WorkflowApiArgumentRejection[];
}
export interface CompileWorkflowApiValuesInput extends WorkflowApiValueContext {
  plan: WorkflowApiValuePlan;
}
export interface ValidateCompiledWorkflowApiValuesInput extends WorkflowApiValueContext {
  result: CompiledWorkflowApiValues;
}
export interface AttributeApiValueEvidenceInput {
  call: WorkflowApiValueContext['calls'][number];
  values: ApiArgumentProposal['values'];
  messages: WorkflowSourceMessage[];
  interpretSchemaChoices: boolean;
}
export type ApiValueEvidenceResolver = (
  input: Pick<AttributeApiValueEvidenceInput, 'call' | 'values'>,
) => ApiValueEvidence;
