import type { JsonValueObject } from './api-arguments.js';
import type { BindingSchema } from './api-bindings.js';
import type {
  PrepareWorkflowDraftEditInput,
  StagedWorkflowDraftEdit,
  WorkflowDraftEditResolution,
} from './workflow-draft-edit-assembly.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';
import type { MissingWorkflowNativeMaterialRequirement } from './native-material-snapshot.js';
import type { NativeRuntimeParameterSelection } from './workflow-plan.js';
import type { NativeNodeConfigurationDependencies } from './native-instance-dependencies.js';
import type { WorkflowDraftNativeDependencyRole } from './workflow-draft-native-dependencies.js';
import type {
  ProposedWorkflowDraftSourceEvidence,
  ResolvedWorkflowDraftSourceEvidence,
  WorkflowDraftSourceEvidenceDescription,
} from './workflow-draft-source-evidence.js';

export interface WorkflowDraftNativeNodeAdditionInput extends PrepareWorkflowDraftEditInput {
  stepId: string;
  allowRuntimeParameters?: boolean;
  /** A separately validated decision; the value stage cannot select ownership again. */
  parameterOwnership?: WorkflowDraftNativeNodeParameterOwnershipContract;
}
export type WorkflowDraftNativeNodeParameterOwnershipChoice =
  | { status: 'literal' }
  | { status: 'runtime-parameters' }
  | { status: 'runtime-fields'; pointers: string[] }
  | { status: 'needs-clarification'; message: string };
export interface WorkflowDraftNativeNodeParameterOwnershipProposal {
  decision: WorkflowDraftNativeNodeParameterOwnershipChoice &
    ProposedWorkflowDraftSourceEvidence;
}
export interface WorkflowDraftNativeNodeParameterOwnershipContract {
  id: string;
  fingerprint: string;
  stepId: string;
  nodeId: string;
  proposal: WorkflowDraftNativeNodeParameterOwnershipProposal;
  decision: WorkflowDraftNativeNodeParameterOwnershipChoice &
    ResolvedWorkflowDraftSourceEvidence;
  literalParametersSchema: BindingSchema;
  hasLiteralParameters: boolean;
  runtimeParameters?: true | NativeRuntimeParameterSelection;
}
export interface ResolveWorkflowDraftNativeNodeParameterOwnershipInput extends WorkflowDraftNativeNodeAdditionInput {
  fingerprint: string;
  proposal: WorkflowDraftNativeNodeParameterOwnershipProposal;
}
export type WorkflowDraftNativeNodeParameterOwnershipResult =
  | {
      status: 'ready';
      contract: WorkflowDraftNativeNodeParameterOwnershipContract;
    }
  | {
      status: 'needs-clarification';
      fingerprint: string;
      proposal: WorkflowDraftNativeNodeParameterOwnershipProposal;
      questions: WorkflowDraftNativeNodeAdditionQuestion[];
    };
export interface WorkflowDraftNativeNodeAdditionReadiness {
  status: 'ready' | 'requires-context';
  nodeId: string;
  capability: string;
  missingContext: MissingWorkflowNativeMaterialRequirement[];
  pendingSourceNodeIds?: string[];
}
export interface WorkflowDraftNativeNodeAdditionDescription extends WorkflowDraftSourceEvidenceDescription {
  fingerprint: string;
  stage: StagedWorkflowDraftEdit;
  nodeId: string;
  capability: {
    name: string;
    description: string;
    supportsRuntimeParameters: boolean;
  };
  instruction: string;
  parametersSchema: BindingSchema;
  /** The registered input contract proves that {} is its only possible value. */
  parameterMode: 'fixed-empty' | 'values';
  backgroundMessages: WorkflowSourceMessage[];
  allowRuntimeParameters: boolean;
  sourceDependencies?: NativeNodeConfigurationDependencies;
  plannedNativeRoles?: WorkflowDraftNativeDependencyRole[];
}
export type WorkflowDraftNativeNodeAdditionChoice =
  | { status: 'provided'; parameters: JsonValueObject }
  | { status: 'runtime-parameters' }
  | { status: 'needs-clarification'; message: string };
export interface WorkflowDraftNativeNodeAdditionProposal {
  decision: WorkflowDraftNativeNodeAdditionChoice &
    ProposedWorkflowDraftSourceEvidence;
}
export interface ResolveWorkflowDraftNativeNodeAdditionInput extends WorkflowDraftNativeNodeAdditionInput {
  fingerprint: string;
  proposal: WorkflowDraftNativeNodeAdditionProposal;
}
export interface WorkflowDraftNativeNodeAdditionQuestion extends ResolvedWorkflowDraftSourceEvidence {
  id: string;
  nodeId: string;
  message: string;
}
export type WorkflowDraftNativeNodeAdditionResult = {
  fingerprint: string;
  proposal: WorkflowDraftNativeNodeAdditionProposal;
  decision: WorkflowDraftNativeNodeAdditionChoice &
    ResolvedWorkflowDraftSourceEvidence;
  parameterOwnership?: WorkflowDraftNativeNodeParameterOwnershipContract;
} & (
  | {
      status: 'ready';
      resolution: Extract<
        WorkflowDraftEditResolution,
        { kind: 'native-literal' | 'native-runtime' | 'native-mixed' }
      >;
    }
  | {
      status: 'needs-clarification';
      questions: WorkflowDraftNativeNodeAdditionQuestion[];
    }
);
