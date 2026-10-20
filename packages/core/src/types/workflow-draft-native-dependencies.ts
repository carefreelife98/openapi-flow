import type { NativeInstanceDependencyProposal } from './native-instance-dependencies.js';
import type { PrepareWorkflowDraftEditInput } from './workflow-draft-edit-assembly.js';
import type {
  ValidateWorkflowDraftEditPlanInput,
  WorkflowDraftEditPlan,
} from './workflow-draft-edit.js';
import type { ResolvedWorkflowDraftClarificationScopes } from './workflow-draft-clarification.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';
import type { WorkflowDraftReferenceSources } from './workflow-draft-reference-sources.js';
import type { WorkflowCapability } from './workflow-plan.js';

export interface WorkflowDraftNativeDependenciesInput extends ValidateWorkflowDraftEditPlanInput {
  clarificationScopes?: ResolvedWorkflowDraftClarificationScopes;
}

export interface WorkflowDraftNativeDependencyRole {
  nodeId: string;
  stepId: string;
  capability: string;
  description: string;
  instruction: string;
  parameterReferenceSources: NonNullable<
    WorkflowCapability['parameterReferenceSources']
  >;
}

export interface WorkflowDraftNativeDependencyContext {
  plan: WorkflowDraftEditPlan;
  /** Immutable pre-configuration contracts, not a capture of accumulated value-stage results. */
  sources: WorkflowDraftReferenceSources;
  roles: WorkflowDraftNativeDependencyRole[];
  pendingNativeSources: WorkflowDraftNativeDependencyRole[];
  sourceCandidatesByNodeId: Record<string, string[]>;
  messages: WorkflowSourceMessage[];
  backgroundMessages: WorkflowSourceMessage[];
  includeExplanations: boolean;
}

export interface WorkflowDraftNativeDependencies {
  id: string;
  context: WorkflowDraftNativeDependencyContext;
  proposal: NativeInstanceDependencyProposal;
}

export interface ResolveWorkflowDraftNativeDependenciesInput extends WorkflowDraftNativeDependenciesInput {
  proposal: NativeInstanceDependencyProposal;
}

export interface ValidateWorkflowDraftNativeDependenciesInput extends WorkflowDraftNativeDependenciesInput {
  producerDependencies: WorkflowDraftNativeDependencies;
}

export interface ValidateWorkflowDraftNativeDependencyResolutionsInput extends PrepareWorkflowDraftEditInput {
  producerDependencies: WorkflowDraftNativeDependencies;
}
