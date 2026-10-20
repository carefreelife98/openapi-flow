import type { BindingSchema } from './api-bindings.js';
import type { JsonValue } from './api-arguments.js';
import type { PlannedNativeNode, WorkflowCapability } from './workflow-plan.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';
import type {
  WorkflowDraftReferenceSource,
  WorkflowDraftExclusiveOutputSource,
} from './workflow-draft-reference-sources.js';
import type { WorkflowMessageEvidence } from './planning-evidence.js';
import type { WorkflowDecisionExplanation } from './workflow-clarification.js';
import type {
  PrepareWorkflowDraftEditInput,
  StagedWorkflowDraftEdit,
  WorkflowDraftEditResolution,
  WorkflowDraftValueEdit,
} from './workflow-draft-edit-assembly.js';

export type WorkflowDraftNativeParameterChange =
  WorkflowDraftValueEdit | { kind: 'defer'; pointer: string };
export interface ApplyWorkflowDraftNativeParameterChangesInput {
  node: PlannedNativeNode;
  capability: WorkflowCapability;
  edits: WorkflowDraftNativeParameterChange[];
  source: string;
}

export interface WorkflowDraftNativeParameterEditInput extends PrepareWorkflowDraftEditInput {
  stepId: string;
  /** Explicit opt-in to changing whole-object ownership to execution-time input. */
  // Also permits an explicit field-level deferral without changing other owners.
  allowRuntimeParameters?: boolean;
}
export interface WorkflowDraftNativeParameterEditEvidence {
  sources: WorkflowMessageEvidence[];
  explanation?: WorkflowDecisionExplanation<WorkflowMessageEvidence>;
}
export interface ProposedWorkflowDraftNativeParameterEditTarget extends WorkflowDraftNativeParameterEditEvidence {
  kind: 'set' | 'remove' | 'defer';
  pointer: string;
}
export type WorkflowDraftNativeParameterEditDecision =
  | {
      status: 'targets';
      targets: ProposedWorkflowDraftNativeParameterEditTarget[];
    }
  | (WorkflowDraftNativeParameterEditEvidence & {
      status: 'needs-clarification';
      message: string;
    })
  | (WorkflowDraftNativeParameterEditEvidence & {
      status: 'runtime-parameters';
    });
export interface WorkflowDraftNativeParameterEditProposal {
  decision: WorkflowDraftNativeParameterEditDecision;
}
export interface WorkflowDraftNativeParameterEditDescription {
  fingerprint: string;
  stage: StagedWorkflowDraftEdit;
  node: PlannedNativeNode;
  capability: {
    name: string;
    description: string;
    supportsRuntimeParameters: boolean;
  };
  parametersSchema: BindingSchema;
  instruction: string;
  messages: WorkflowSourceMessage[];
  backgroundMessages: WorkflowSourceMessage[];
  sourceCandidates: WorkflowDraftReferenceSource[];
  exclusiveOutputSources: WorkflowDraftExclusiveOutputSource[];
  includeExplanations: boolean;
  allowRuntimeParameters: boolean;
}
export type WorkflowDraftNativeParameterEditTarget =
  ProposedWorkflowDraftNativeParameterEditTarget & { id: string } & (
      { kind: 'set'; schema: BindingSchema } | { kind: 'remove' | 'defer' }
    );
export interface WorkflowDraftNativeParameterEditContract {
  id: string;
  fingerprint: string;
  stepId: string;
  nodeId: string;
  schemaResource: BindingSchema;
  targets: WorkflowDraftNativeParameterEditTarget[];
}
export interface ResolveWorkflowDraftNativeParameterEditTargetsInput extends WorkflowDraftNativeParameterEditInput {
  fingerprint: string;
  proposal: WorkflowDraftNativeParameterEditProposal;
}
export interface WorkflowDraftNativeParameterEditQuestion extends WorkflowDraftNativeParameterEditEvidence {
  id: string;
  nodeId: string;
  message: string;
  targetId?: string;
  pointer?: string;
}
export type WorkflowDraftNativeParameterEditTargetsResult =
  | { status: 'ready'; contract: WorkflowDraftNativeParameterEditContract }
  | {
      status: 'needs-clarification';
      questions: WorkflowDraftNativeParameterEditQuestion[];
    }
  | {
      status: 'runtime-parameters';
      resolution: Extract<
        WorkflowDraftEditResolution,
        { kind: 'native-runtime' }
      >;
    };
export interface WorkflowDraftNativeParameterEditContractInput extends WorkflowDraftNativeParameterEditInput {
  contract: WorkflowDraftNativeParameterEditContract;
}
export type WorkflowDraftNativeParameterEditValue =
  WorkflowDraftNativeParameterEditEvidence &
    (
      | { status: 'provided'; value: JsonValue }
      | { status: 'needs-input'; message: string }
    );
export interface WorkflowDraftNativeParameterEditValues {
  values: Record<string, WorkflowDraftNativeParameterEditValue>;
}
export interface ResolveWorkflowDraftNativeParameterEditsInput extends WorkflowDraftNativeParameterEditContractInput {
  output: WorkflowDraftNativeParameterEditValues;
}
export type WorkflowDraftNativeParameterEditResult =
  | {
      status: 'ready';
      contractId: string;
      values: WorkflowDraftNativeParameterEditValues;
      resolution: Extract<
        WorkflowDraftEditResolution,
        { kind: 'native-parameters' }
      >;
    }
  | {
      status: 'needs-input';
      contractId: string;
      values: WorkflowDraftNativeParameterEditValues;
      questions: WorkflowDraftNativeParameterEditQuestion[];
    };
