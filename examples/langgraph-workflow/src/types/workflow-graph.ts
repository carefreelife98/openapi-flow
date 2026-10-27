import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ApiSelectionModelOptions,
  AnalyzeApiRequestMediaTypeInput,
  GenerateApiArgumentsInput,
  PlanApiBindingsInput,
  PlanNativeNodesInput,
  NativeNodePlan,
  PlanWorkflowConnectionsInput,
  PlanWorkflowGraphInput,
  AnalyzeApiInputAnswersInput,
} from '@openapi-flow/langchain';
import type { HttpRequestDeploymentOptions } from '@openapi-flow/n8n';
import type {
  ApiSelection,
  ApiOperationContract,
  ApiCallArguments,
  ApiBindingPlan,
  PlannedNativeNode,
  ApiRequestMediaTypeDecision,
  WorkflowReviewGap,
  ReviewableWorkflowGraphPlan,
} from '@openapi-flow/core';
import type { N8nNodeFragment, N8nGraphEdge } from '@openapi-flow/n8n';
import type { workflowStateSchema } from '../schemas/workflow-state-schema.js';
import type { WorkflowGraphPlan } from '@openapi-flow/core';
import type { N8nNativeCapability } from '@openapi-flow/n8n';
import type { NativePlanningGraphDependencies } from './native-planning.js';
import type { ApiArgumentPlanningOptions } from './api-argument-planning.js';

export type WorkflowState = typeof workflowStateSchema.State;
export type WorkflowUpdate = typeof workflowStateSchema.Update;

export interface NativeWorkflowMaterialPlan {
  /** All supplied prepared instances plus actual additions, for later compilation. */
  nativeNodes: PlannedNativeNode[];
  gaps: WorkflowReviewGap[];
  /** Validated additions; compact plans may also retain their single-call provenance record. */
  proposal: NativeNodePlan;
}

export interface ResolvedApiRequestMediaType {
  callId: string;
  requestMediaType?: string;
  decision: ApiRequestMediaTypeDecision;
}

export interface ServiceDeployment extends HttpRequestDeploymentOptions {
  documentId: string;
}

export interface GraphDependencies {
  model: BaseChatModel;
  deployments?: ServiceDeployment[];
  /** Applies only to discovery selection, not all later planning stages. */
  selectionOptions?: ApiSelectionModelOptions;
  /** Applies only to request-body format assessment, not value or graph planning. */
  requestMediaOptions?: Pick<
    AnalyzeApiRequestMediaTypeInput,
    'includeExplanations'
  >;
  argumentOptions?: Pick<
    GenerateApiArgumentsInput,
    'includeExplanations' | 'selectOasEnums' | 'trackRequestedInputs'
  >;
  bindingOptions?: Pick<PlanApiBindingsInput, 'includeExplanations'>;
  /** Explicit host-owned correction policy, separate from OSS value-generation options. */
  argumentPlanning?: ApiArgumentPlanningOptions;
  nativeOptions?: Pick<PlanNativeNodesInput, 'includeExplanations'>;
  connectionOptions?: Pick<PlanWorkflowConnectionsInput, 'includeExplanations'>;
  graphOptions?: Pick<PlanWorkflowGraphInput, 'includeExplanations'>;
  answerOptions?: Pick<AnalyzeApiInputAnswersInput, 'includeExplanations'>;
}

export interface ApiPreparationDependencies extends GraphDependencies {
  /** Explicit per-call linked item execution; single-item requests are unchanged. */
  linkedItemCallIds?: string[];
  reviewSelection?: (selection: ApiSelection) => void;
  reviewBindings?: (plan: ApiBindingPlan) => void | Promise<void>;
}

export interface PlannedGraphDependencies extends ApiPreparationDependencies {
  capabilities: N8nNativeCapability[];
  reviewPlan?: (plan: ReviewedWorkflowPlan) => void | Promise<void>;
  preparedNativeNodes?: PlannedNativeNode[];
}

export type ReviewedWorkflowPlan = WorkflowGraphPlan &
  Pick<ReviewableWorkflowGraphPlan, 'connectionPlanning'>;

export interface OrchestratedGraphDependencies extends Omit<
  NativePlanningGraphDependencies,
  'capabilities'
> {
  capabilities?: N8nNativeCapability[];
}

export interface ResolvedRequestNode {
  operation: ApiOperationContract;
  arguments: ApiCallArguments;
  fragment: N8nNodeFragment;
  purpose?: string;
}

export interface HostDagTopology {
  nodes: N8nNodeFragment[];
  edges: N8nGraphEdge[];
  starts: string[];
}

export interface DagGraphDependencies extends GraphDependencies {
  reviewSelection: (selection: ApiSelection) => void;
  composeDag: (requests: ResolvedRequestNode[]) => HostDagTopology;
}
