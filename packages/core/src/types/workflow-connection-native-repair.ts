import type { z } from 'zod';
import type { ValidateWorkflowConnectionSourceRepairRequestInput } from './workflow-connection-material-repair.js';
import type { WorkflowConnectionApiResponseContext } from './workflow-connection-material-repair.js';
import type {
  WorkflowConnectionSessionDescription,
  WorkflowConnectionOperationContext,
} from './workflow-connection-session.js';
import type { WorkflowConnectionPlanningContext } from './workflow-connection-planning.js';
import type { WorkflowRequirementFact } from './workflow-clarification.js';
import type {
  NativePlanningApiMaterial,
  NativeNodeParameterProposal,
  NativeNodeParameterResult,
  NativeParameterGenerationContract,
  ReadyNativeNodeParameters,
} from './native-node-planning.js';
import type { NativeProducerDependencyTarget } from './native-producer-dependencies.js';
import type { NativeInstanceDependencyProposal } from './native-instance-dependencies.js';
import type { NativeOutputContract } from './node-output.js';
import type {
  PlannedNativeNode,
  WorkflowCapability,
  WorkflowPlanNodeContract,
} from './workflow-plan.js';

export type WorkflowConnectionNativeNodePorts = Pick<
  WorkflowPlanNodeContract,
  'id' | 'inputs' | 'outputs' | 'waitsForAllInputs' | 'exclusiveOutputPorts'
>;
export interface WorkflowConnectionNativeApiOverview
  extends
    WorkflowConnectionNativeNodePorts,
    Omit<WorkflowConnectionOperationContext, 'nodeId'> {}
export interface WorkflowConnectionNativeNodeOverview
  extends
    WorkflowConnectionNativeNodePorts,
    Pick<PlannedNativeNode, 'capability'>,
    Pick<WorkflowCapability, 'description'> {}
/** Read-only source-revision inventory; it grants no parameter reference authority. */
export interface WorkflowConnectionNativeWorkflowContext extends Pick<
  WorkflowConnectionPlanningContext,
  'entrypoint' | 'edges' | 'gaps'
> {
  apiNodes: WorkflowConnectionNativeApiOverview[];
  nativeNodes: WorkflowConnectionNativeNodeOverview[];
}

export interface WorkflowConnectionNativeRepairInput extends ValidateWorkflowConnectionSourceRepairRequestInput {
  includeExplanations?: boolean;
}
export interface WorkflowConnectionNativeRepairContext {
  fingerprint: string;
  sourceFingerprint: string;
  scenario: string;
  reason: string;
  requirements: WorkflowRequirementFact[];
  apiMaterials: WorkflowConnectionNativeApiSource[];
  nativeNodes: PlannedNativeNode[];
  outputs: NativeOutputContract[];
}
export interface WorkflowConnectionNativeApiSource
  extends
    WorkflowConnectionApiResponseContext,
    Pick<NativePlanningApiMaterial, 'purpose'> {
  summary?: string;
  description?: string;
}
export interface WorkflowConnectionNativeDependencyDescription extends WorkflowConnectionNativeRepairContext {
  targets: NativeProducerDependencyTarget[];
  previousSources: NativeInstanceDependencyProposal;
}
export interface WorkflowConnectionNativeDependencies {
  fingerprint: string;
  proposal: NativeInstanceDependencyProposal;
}
export interface ResolveWorkflowConnectionNativeDependenciesInput extends WorkflowConnectionNativeRepairInput {
  proposal: NativeInstanceDependencyProposal;
}
export interface WorkflowConnectionNativeParametersInput extends WorkflowConnectionNativeRepairInput {
  nodeId: string;
  /** Required for a dependency target; never substitutes old sources after an explicit producer repair. */
  dependencies?: WorkflowConnectionNativeDependencies;
  /** Ordered Core results; every receipt is replayed against the same source and its exact preceding results. */
  completedParameters?: ReadyNativeNodeParameters[];
}
export interface WorkflowConnectionNativeParametersDescription extends WorkflowConnectionNativeRepairContext {
  workflowContext: WorkflowConnectionNativeWorkflowContext;
  target: PlannedNativeNode;
  capabilityDescription: string;
  sourceNodeIds: string[];
  literalParametersSchema: NativeParameterGenerationContract['literalParametersSchema'];
  hasLiteralParameters: boolean;
}
export interface ResolveWorkflowConnectionNativeParametersInput extends WorkflowConnectionNativeParametersInput {
  fingerprint: string;
  proposal: NativeNodeParameterProposal;
}
export type WorkflowConnectionNativeParameterResult = NativeNodeParameterResult;
/** Internal executable contracts never enter a checkpoint or the model payload. */
export interface PreparedConnectionNativeRepair {
  description: WorkflowConnectionSessionDescription;
  context: WorkflowConnectionNativeRepairContext;
}
export interface PreparedConnectionNativeParameters {
  description: WorkflowConnectionNativeParametersDescription;
  capability: WorkflowCapability;
  contract: NativeParameterGenerationContract;
  schema: z.ZodType<NativeNodeParameterProposal>;
}
