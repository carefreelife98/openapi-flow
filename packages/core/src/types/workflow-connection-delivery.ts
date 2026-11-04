import type {
  WorkflowConnectionSession,
  WorkflowConnectionOpenBoundary,
} from './workflow-connection-session.js';
import type {
  ReviewableWorkflowGraphPlan,
  WorkflowReviewGap,
  BlockedWorkflowCall,
} from './reviewable-workflow.js';
import type { WorkflowDraftApiCall } from './workflow-draft.js';
import type { PlannedNativeNode, WorkflowPlanEdge } from './workflow-plan.js';

export interface WorkflowConnectionDeliveryComponent {
  nodeIds: string[];
  goalIds: string[];
  rootNodeIds: string[];
  edges: WorkflowPlanEdge[];
  nativeNodes: PlannedNativeNode[];
  apiCalls: WorkflowDraftApiCall[];
  blockedCalls: BlockedWorkflowCall[];
  openBoundaries: WorkflowConnectionOpenBoundary[];
  pendingNodeIds: string[];
  blockedGoalIds: string[];
  gapIds: string[];
  gaps: WorkflowReviewGap[];
  runtimeInputNodeIds: string[];
  /** Present only after both the receipt and the projected execution graph are validated. */
  plan?: ReviewableWorkflowGraphPlan;
}

export interface WorkflowConnectionDelivery {
  status: 'complete' | 'partial' | 'draft';
  sessionId: WorkflowConnectionSession['id'];
  sourceFingerprint: WorkflowConnectionSession['sourceFingerprint'];
  revision: WorkflowConnectionSession['revision'];
  components: WorkflowConnectionDeliveryComponent[];
  /** Original unmet goals and reasons are preserved, never rewritten as success. */
  unmetGoals: WorkflowConnectionSession['goals'];
  unmetAssessments: WorkflowConnectionSession['assessments'];
}
