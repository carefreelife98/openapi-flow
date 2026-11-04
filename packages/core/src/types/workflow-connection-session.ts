import type { z } from 'zod';
import type { workflowConnectionReviewBoundarySchema } from '../schemas/workflow-connection-review-boundary-schema.js';
import type { WorkflowPlanningSourceEvidence } from './workflow-planning-materials.js';

export type WorkflowConnectionReviewBoundary = z.infer<
  typeof workflowConnectionReviewBoundarySchema
>;
export type WorkflowConnectionAvailableCapability = Omit<
  WorkflowPlanningSourceEvidence['capabilities'][number],
  'materialSources'
>;
export interface WorkflowConnectionVerificationContract {
  target: 'generated-workflow-configuration';
  basis: 'supplied-operation-contracts-and-registered-native-implementations';
  checks: Record<
    Exclude<WorkflowConnectionGoalProposal['kind'], 'semantic' | 'unsupported'>,
    string
  >;
}
import type { WorkflowConnectionEvidence } from './workflow-connection-evidence.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';
import type {
  WorkflowConnectionPlanningInput,
  WorkflowConnectionPlanningDescription,
  WorkflowConnectionPlanningContext,
} from './workflow-connection-planning.js';
import type { WorkflowRequirementFact } from './workflow-clarification.js';
import type { WorkflowPlanningConstraintInspection } from './workflow-planning-constraints.js';
import type { WorkflowConnectionMaterialRepairStage } from './workflow-connection-material-repair.js';
import type {
  ApiOperationContract,
  ApiOperationObject,
} from './api-operation.js';
import type {
  WorkflowPlanEdge,
  WorkflowPlanNodeContract,
  PlannedNativeNode,
  WorkflowTopologyRoutes,
} from './workflow-plan.js';
import type {
  workflowConnectionSessionSchema,
  workflowConnectionGoalProposalSchema,
  workflowConnectionStepProposalSchema,
  workflowConnectionPatchSchema,
  workflowConnectionTerminalSchema,
  workflowConnectionAssessmentSchema,
  workflowConnectionMaterialRequestSchema,
  workflowConnectionUserDecisionSchema,
  workflowConnectionPlanningDecisionSchema,
  workflowConnectionViolationSchema,
  workflowConnectionRejectedProposalSchema,
  workflowConnectionStepExpectationSchema,
} from '../schemas/workflow-connection-session-schema.js';

export type WorkflowConnectionSession = z.infer<
  typeof workflowConnectionSessionSchema
>;
export type WorkflowConnectionGoalProposal = z.infer<
  typeof workflowConnectionGoalProposalSchema
>;
export type WorkflowConnectionStepProposal = z.infer<
  typeof workflowConnectionStepProposalSchema
>;
export type WorkflowConnectionPatch = z.infer<
  typeof workflowConnectionPatchSchema
>;
export type WorkflowConnectionCompletionProposal = Exclude<
  WorkflowConnectionStepProposal,
  WorkflowConnectionPatch
>;
export type WorkflowConnectionTerminal = z.infer<
  typeof workflowConnectionTerminalSchema
>;
export type WorkflowConnectionAssessment = z.infer<
  typeof workflowConnectionAssessmentSchema
>;
export type WorkflowConnectionMaterialRequest = z.infer<
  typeof workflowConnectionMaterialRequestSchema
>;
export type WorkflowConnectionUserDecision = z.infer<
  typeof workflowConnectionUserDecisionSchema
>;
export type WorkflowConnectionPlanningDecision = z.infer<
  typeof workflowConnectionPlanningDecisionSchema
>;

export interface WorkflowConnectionSessionSource extends WorkflowConnectionPlanningInput {
  /** Opt-in contract-scoped verification. Omission retains the separate legacy semantic-review contract. */
  reviewBoundary?: WorkflowConnectionReviewBoundary;
  /** Authoritative original messages for existing literal attribution. Never substitute goal or repair prose. */
  literalSourceMessages?: WorkflowSourceMessage[];
  requirements: WorkflowRequirementFact[];
  /** Only explicitly editable original edges may be removed. New session edges are editable. */
  editableEdgeIds?: string[];
}
export interface CreateWorkflowConnectionSessionInput extends WorkflowConnectionSessionSource {
  goals: WorkflowConnectionGoalProposal[];
}
export interface WorkflowConnectionSessionInput extends WorkflowConnectionSessionSource {
  session: WorkflowConnectionSession;
}
export interface ApplyWorkflowConnectionStepInput extends WorkflowConnectionSessionInput {
  expected: WorkflowConnectionStepExpectation;
  proposal: WorkflowConnectionStepProposal;
}
export interface ExtendWorkflowConnectionSessionInput extends WorkflowConnectionSessionInput {
  expected: WorkflowConnectionStepExpectation;
  additionalNativeNodes: PlannedNativeNode[];
}
export interface WorkflowConnectionMaterialExtension {
  previousSession: WorkflowConnectionSession;
  session: WorkflowConnectionSession;
  previous: WorkflowConnectionStepExpectation;
  addedNativeNodeIds: string[];
}
export type WorkflowConnectionViolation = z.infer<
  typeof workflowConnectionViolationSchema
>;
export interface WorkflowConnectionOpenBoundary {
  nodeId: string;
  direction: 'input' | 'output';
  port: string;
}
export interface WorkflowConnectionInspection {
  ready: boolean;
  openBoundaries: WorkflowConnectionOpenBoundary[];
  pendingNodeIds: string[];
  unmetGoalIds: string[];
  semanticAssessmentGoalIds: string[];
  unassessedGoalIds: string[];
  insufficientEvidenceGoalIds: string[];
  unsupportedGoalIds: string[];
  violations: WorkflowConnectionViolation[];
}
export type ApplyWorkflowConnectionStepResult =
  | {
      status: 'accepted';
      session: WorkflowConnectionSession;
      inspection: WorkflowConnectionInspection;
    }
  | { status: 'rejected'; violations: WorkflowConnectionViolation[] };

export interface WorkflowConnectionSessionDescription {
  source: WorkflowConnectionPlanningDescription;
  fingerprint: string;
  apiOperations: WorkflowConnectionOperationContext[];
}
export interface WorkflowConnectionSessionValidation extends WorkflowConnectionSessionDescription {
  visitedGraphFingerprints: Set<string>;
}
export interface WorkflowConnectionWorkingGraph {
  edges: WorkflowPlanEdge[];
  rootNodeIds: string[];
  terminals: WorkflowConnectionTerminal[];
  assessments: WorkflowConnectionAssessment[];
}
export interface InspectWorkflowConnectionGraphInput {
  contracts: WorkflowPlanNodeContract[];
  graph: WorkflowConnectionWorkingGraph;
  apiIds: Set<string>;
}
export interface InspectWorkflowConnectionGraphResult {
  openBoundaries: WorkflowConnectionOpenBoundary[];
  pendingNodeIds: string[];
  violations: WorkflowConnectionViolation[];
  /** Runtime proof only. Never publish or checkpoint this Map/Set evidence. */
  routeStates: WorkflowTopologyRoutes;
}
export interface ApplyWorkflowConnectionPatchInput {
  graph: WorkflowConnectionWorkingGraph;
  proposal: WorkflowConnectionPatch;
  protectedEdgeIds: Set<string>;
}
export interface WorkflowConnectionStepDescription {
  evidence: WorkflowConnectionEvidence[];
  expected: WorkflowConnectionStepExpectation;
  context: WorkflowConnectionPlanningContext;
  apiOperations: WorkflowConnectionOperationContext[];
  requirements: WorkflowRequirementFact[];
  goals: WorkflowConnectionSession['goals'];
  edgeCatalog: WorkflowConnectionEdgeReference[];
  rootNodeIds: string[];
  terminals: WorkflowConnectionTerminal[];
  inspection: WorkflowConnectionInspection;
}
export interface WorkflowConnectionEdgeReference {
  id: string;
  edge: WorkflowPlanEdge;
  editable: boolean;
}
export interface WorkflowConnectionGoalPlanningDescription {
  reviewBoundary?: WorkflowConnectionReviewBoundary;
  availableCapabilities?: WorkflowConnectionAvailableCapability[];
  verificationContract?: WorkflowConnectionVerificationContract;
  evidence: WorkflowConnectionEvidence[];
  sourceFingerprint: string;
  context: WorkflowConnectionPlanningContext;
  apiOperations: WorkflowConnectionOperationContext[];
  requirements: WorkflowRequirementFact[];
  constraints: WorkflowPlanningConstraintInspection;
  materialRepairStages: WorkflowConnectionMaterialRepairStage[];
}
export interface WorkflowConnectionOperationContext
  extends
    Pick<ApiOperationContract, 'key' | 'method' | 'path'>,
    Pick<
      ApiOperationObject,
      'operationId' | 'summary' | 'description' | 'tags'
    > {
  nodeId: string;
  purpose?: string;
}
export type WorkflowConnectionRejectedProposal = z.infer<
  typeof workflowConnectionRejectedProposalSchema
>;
export type WorkflowConnectionStepExpectation = z.infer<
  typeof workflowConnectionStepExpectationSchema
>;
