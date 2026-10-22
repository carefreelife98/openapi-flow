import type {
  ApiArgumentValues,
  ApiCallArguments,
  OutputBinding,
} from './api-arguments.js';
import type {
  ApiInputRequirement,
  ConfirmedApiInput,
} from './api-clarification.js';
import type { ApiOperationContract } from './api-operation.js';
import type { JsonObject } from './openapi.js';
import type {
  WorkflowDraftApiLiteralSource,
  VerifiedWorkflowDraftApiLiteralSource,
} from './workflow-draft-api-literal-sources.js';
import type {
  PrepareWorkflowDraftEditInput,
  StagedWorkflowDraftEdit,
  WorkflowDraftEditResolution,
} from './workflow-draft-edit-assembly.js';
import type {
  WorkflowDraftApiCall,
  WorkflowSourceMessage,
} from './workflow-draft.js';
import type {
  ProposedWorkflowDraftSourceEvidence,
  ResolvedWorkflowDraftSourceEvidence,
  WorkflowDraftSourceEvidenceDescription,
} from './workflow-draft-source-evidence.js';
import type {
  ProposedWorkflowDraftApiBindingQuestion,
  WorkflowDraftApiBindingAnswer,
  WorkflowDraftApiCallPlanningQuestion,
} from './workflow-draft-api-binding-clarification.js';
import type { WorkflowDraftApiBindingIntent } from './workflow-draft-api-binding-intent.js';
import type { BindingSchema } from './api-bindings.js';
import type {
  WorkflowDraftApiEnumSelection,
  VerifiedWorkflowDraftApiEnumSelection,
} from './workflow-draft-api-enum-selection.js';

/** One operation already selected by an add-api-call or replace-api-operation decision. */
export interface WorkflowDraftApiCallPlanningInput extends PrepareWorkflowDraftEditInput {
  stepId: string;
  requestMediaType?: string;
}
export interface WorkflowDraftApiCallPlanningDescription extends WorkflowDraftSourceEvidenceDescription {
  fingerprint: string;
  stage: StagedWorkflowDraftEdit;
  kind: 'add-api-call' | 'replace-api-operation';
  nodeId: string;
  operation: ApiOperationContract;
  previousCall?: WorkflowDraftApiCall;
  instruction: string;
  requestMediaType?: string;
  requestSchema: JsonObject;
  requestInputRoots: string[];
  hasRequestInputs: boolean;
  /** Includes selected but not-yet-materialized producers; absence is not missing contract readiness. */
  hasOtherSelectedNodes: boolean;
  backgroundMessages: WorkflowSourceMessage[];
}
export interface ProposedWorkflowDraftApiCallMapping {
  targetPointer: string;
  sourceNodeId: string;
  sourcePointer: string;
}
export interface WorkflowDraftApiCallBindingsInput extends WorkflowDraftApiCallPlanningInput {
  inputIntent?: WorkflowDraftApiBindingIntent;
}
export interface WorkflowDraftApiBindingTarget {
  targetPointer: string;
  schemas: BindingSchema[];
}
export interface WorkflowDraftApiCallBindingsDescription extends WorkflowDraftApiCallPlanningDescription {
  inputIntent?: WorkflowDraftApiBindingIntent;
  bindingTargets?: WorkflowDraftApiBindingTarget[];
}
export type WorkflowDraftApiCallBindingChoice =
  | { status: 'provided'; mappings: ProposedWorkflowDraftApiCallMapping[] }
  | {
      status: 'needs-clarification';
      mappings: ProposedWorkflowDraftApiCallMapping[];
      questions: ProposedWorkflowDraftApiBindingQuestion[];
    };
export type ProposedWorkflowDraftApiCallBindingChoice =
  | { status: 'provided'; mappings?: ProposedWorkflowDraftApiCallMapping[] }
  | {
      status: 'needs-clarification';
      mappings?: ProposedWorkflowDraftApiCallMapping[];
      questions: ProposedWorkflowDraftApiBindingQuestion[];
    };
export interface WorkflowDraftApiCallBindingProposal {
  decision: ProposedWorkflowDraftApiCallBindingChoice &
    ProposedWorkflowDraftSourceEvidence;
}
export interface ResolveWorkflowDraftApiCallBindingsInput extends WorkflowDraftApiCallBindingsInput {
  fingerprint: string;
  proposal: WorkflowDraftApiCallBindingProposal;
  /** Explicit host/user decisions, never model-generated state or inferred mappings. */
  answers?: WorkflowDraftApiBindingAnswer[];
}
export interface WorkflowDraftApiCallBindingResultFields {
  inputIntent?: WorkflowDraftApiBindingIntent;
  fingerprint: string;
  proposal: WorkflowDraftApiCallBindingProposal;
  decision: WorkflowDraftApiCallBindingChoice &
    ResolvedWorkflowDraftSourceEvidence;
  answers?: WorkflowDraftApiBindingAnswer[];
}
export interface ReadyWorkflowDraftApiCallBindings extends WorkflowDraftApiCallBindingResultFields {
  status: 'ready';
  bindings: OutputBinding[];
}
export interface PendingWorkflowDraftApiCallBindings extends WorkflowDraftApiCallBindingResultFields {
  status: 'needs-clarification';
  questions: WorkflowDraftApiCallPlanningQuestion[];
}
export type WorkflowDraftApiCallBindingResult =
  ReadyWorkflowDraftApiCallBindings | PendingWorkflowDraftApiCallBindings;
export interface WorkflowDraftApiCallArgumentsInput extends WorkflowDraftApiCallPlanningInput {
  bindingPlan: ReadyWorkflowDraftApiCallBindings;
  confirmedInputs?: ConfirmedApiInput[];
  /** Explicitly defer missing values to typed n8n inputs; never invent placeholder data. */
  allowRuntimeInputs?: boolean;
  /** Ask the existing argument model for scenario-requested input paths, including unknown optional literals. */
  trackRequestedInputs?: boolean;
}
export interface WorkflowDraftApiCallArgumentsProposal extends ProposedWorkflowDraftSourceEvidence {
  values: ApiArgumentValues;
  requestedInputs?: string[];
  /** Required coverage for every proposed literal; absent only when no values are proposed. */
  literalSources?: WorkflowDraftApiLiteralSource[];
}
export interface WorkflowDraftApiCallArgumentsDescription extends WorkflowDraftApiCallPlanningDescription {
  literalInputSchema: JsonObject;
  hasLiteralInputs: boolean;
}
export interface ResolveWorkflowDraftApiCallArgumentsInput extends WorkflowDraftApiCallArgumentsInput {
  fingerprint: string;
  proposal: WorkflowDraftApiCallArgumentsProposal;
  /** Semantic OAS choices, never raw user literal provenance or confirmed user answers. */
  enumSelections?: WorkflowDraftApiEnumSelection[];
}
export interface WorkflowDraftApiCallArgumentsResultFields extends ResolvedWorkflowDraftSourceEvidence {
  fingerprint: string;
  proposal: WorkflowDraftApiCallArgumentsProposal;
  literalSources: VerifiedWorkflowDraftApiLiteralSource[];
  enumSelections?: VerifiedWorkflowDraftApiEnumSelection[];
  arguments: ApiCallArguments;
  requirements: ApiInputRequirement[];
}
export type WorkflowDraftApiCallArgumentsResult =
  | (WorkflowDraftApiCallArgumentsResultFields & {
      status: 'ready';
      inputMode: 'provided' | 'runtime-inputs';
      resolution: Extract<WorkflowDraftEditResolution, { kind: 'api-call' }>;
    })
  | (WorkflowDraftApiCallArgumentsResultFields & { status: 'needs-input' });
