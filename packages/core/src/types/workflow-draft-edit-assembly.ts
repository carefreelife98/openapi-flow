import type {
  ApiArgumentValues,
  JsonValue,
  JsonValueObject,
  OutputBinding,
} from './api-arguments.js';
import type {
  DraftChangeSet,
  ApplyDraftChangeSetResult,
} from './workflow-draft-changes.js';
import type {
  WorkflowDraft,
  WorkflowDraftContent,
  WorkflowDraftRequirement,
} from './workflow-draft.js';
import type {
  WorkflowDraftEditInput,
  WorkflowDraftEditPlan,
} from './workflow-draft-edit.js';
import type {
  WorkflowPlanEdge,
  NativeRuntimeParameterSelection,
} from './workflow-plan.js';
import type { WorkflowDraftApiResponseSource } from './workflow-draft-api-response-sources.js';
import type { ResolvedWorkflowDraftClarificationScopes } from './workflow-draft-clarification.js';
import type { WorkflowDraftClarificationOwnership } from './workflow-draft-clarification-ownership.js';
import type { WorkflowDraftNativeParameterChange } from './workflow-draft-native-parameter-edit.js';
import type { WorkflowDraftNativeDependencies } from './workflow-draft-native-dependencies.js';

export type WorkflowDraftValueEdit =
  | { kind: 'set'; pointer: string; value: JsonValue }
  | { kind: 'remove'; pointer: string };
export type WorkflowDraftBindingEdit =
  | { kind: 'set'; binding: OutputBinding }
  | { kind: 'remove'; targetPointer: string };
export type WorkflowDraftEditResolution =
  | {
      stepId: string;
      kind: 'api-call';
      values: ApiArgumentValues;
      requestedInputs?: string[];
      bindings: OutputBinding[];
      requestMediaType?: string;
    }
  | {
      stepId: string;
      kind: 'api-inputs';
      edits: WorkflowDraftValueEdit[];
      requestMediaType?: string;
    }
  | {
      stepId: string;
      kind: 'api-bindings';
      edits: WorkflowDraftBindingEdit[];
      valueEdits: WorkflowDraftValueEdit[];
    }
  | { stepId: string; kind: 'native-literal'; parameters: JsonValueObject }
  | {
      stepId: string;
      kind: 'native-mixed';
      parameters: JsonValueObject;
      runtimeParameters: NativeRuntimeParameterSelection;
    }
  | {
      stepId: string;
      kind: 'native-parameters';
      edits: WorkflowDraftNativeParameterChange[];
    }
  | { stepId: string; kind: 'native-runtime' }
  | {
      stepId: string;
      kind: 'requirement';
      answerMessageId: string;
      text: string;
      state: WorkflowDraftRequirement['state'];
      scope: WorkflowDraftRequirement['scope'];
    };
export interface WorkflowDraftEditConnectionChange {
  stepIds: string[];
  kind: 'add-edge' | 'remove-edge';
  edge: WorkflowPlanEdge;
}
export interface WorkflowDraftEditRepairTask {
  id: string;
  nodeId: string;
  kind: 'api-bindings' | 'native-parameters';
  sourceNodeIds: string[];
  /** API repair edits may only change these existing binding targets. */
  targetPointers: string[];
}
export type WorkflowDraftEditRepair =
  | { taskId: string; kind: 'api-bindings'; edits: WorkflowDraftBindingEdit[] }
  | {
      taskId: string;
      kind: 'native-parameters';
      edits: WorkflowDraftValueEdit[];
    };
export interface PrepareWorkflowDraftEditInput extends WorkflowDraftEditInput {
  plan: WorkflowDraftEditPlan;
  resolutions: WorkflowDraftEditResolution[];
  /** Omission means no explicitly completed dependency repairs. */
  repairs?: WorkflowDraftEditRepair[];
  /** Revalidated code-owned projection of the active clarified facts/questions onto actual instance scopes. */
  clarificationScopes?: ResolvedWorkflowDraftClarificationScopes;
  /** Optional original producer choice, revalidated at configuration and final assembly. */
  producerDependencies?: WorkflowDraftNativeDependencies;
}
export interface AssembleWorkflowDraftEditInput extends PrepareWorkflowDraftEditInput {
  /** Omission means preserve all existing connections unchanged. */
  connections?: WorkflowDraftEditConnectionChange[];
}
export interface PreparedWorkflowDraftEdit {
  kind: 'unvalidated-edit-materials';
  planId: string;
  baseRevision: number;
  content: WorkflowDraftContent;
  /** Already applied deterministic cleanup for explicitly removed nodes. Never a reconnect proposal. */
  nodeRemovalConnections: WorkflowDraftEditConnectionChange[];
  pendingRepairs: WorkflowDraftEditRepairTask[];
  deferredRequirementIds: string[];
  pendingClarificationQuestionIds: string[];
}
export interface StagedWorkflowDraftEdit {
  kind: 'unvalidated-edit-stage';
  fingerprint: string;
  planId: string;
  baseRevision: number;
  content: WorkflowDraftContent;
  nodeRemovalConnections: WorkflowDraftEditConnectionChange[];
  pendingResolutionStepIds: string[];
  /** Declared concerns and their verified owners, not answers or completed-stage assertions. */
  clarificationOwnership: WorkflowDraftClarificationOwnership[];
  /** Selected OAS response contracts are independent of request values/readiness. */
  apiResponseSources: WorkflowDraftApiResponseSource[];
  /** Unfinished primary materials/requirements. This does not erase a selected API response declaration. */
  blockedSourceNodeIds: string[];
  pendingRepairs: WorkflowDraftEditRepairTask[];
  deferredRequirementIds: string[];
  pendingClarificationQuestionIds: string[];
}
export interface ChangedWorkflowDraftEdit extends ApplyDraftChangeSetResult {
  status: 'changed';
  changeSet: DraftChangeSet;
  deferredRequirementIds: string[];
}
export interface UnchangedWorkflowDraftEdit {
  status: 'no-change';
  draft: WorkflowDraft;
}
export type AssembledWorkflowDraftEdit =
  ChangedWorkflowDraftEdit | UnchangedWorkflowDraftEdit;
export interface WorkflowDraftEditAssemblyFailure {
  stage: 'dependency-repairs' | 'final-validation';
  pendingRepairs?: WorkflowDraftEditRepairTask[];
  changeSet?: DraftChangeSet;
}
