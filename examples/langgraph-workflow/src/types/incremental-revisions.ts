import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowConnectionSession,
  WorkflowConnectionSessionSource,
  WorkflowConnectionSourceRepairReceipt,
  WorkflowConnectionMaterialExtension,
  WorkflowConnectionRevision,
  WorkflowConnectionGoalReview,
  WorkflowConnectionRevisionImpact,
  PlannedNativeNode,
} from '@openapi-flow/core';

export interface IncrementalSourceRepairEvent {
  kind: 'material-repair';
  receipt: WorkflowConnectionSourceRepairReceipt;
}
export interface IncrementalNativeExtensionEvent {
  kind: 'native-extension';
  beforeSession: WorkflowConnectionSession;
  additionalNativeNodes: PlannedNativeNode[];
  extension: WorkflowConnectionMaterialExtension;
}
export interface IncrementalAcceptedRevisionEvent {
  kind: 'accepted-revision';
  beforeSession: WorkflowConnectionSession;
  repairs: WorkflowConnectionSourceRepairReceipt[];
  revision: WorkflowConnectionRevision;
  review?: WorkflowConnectionGoalReview;
}
export type IncrementalConnectionSourceEvent =
  | IncrementalSourceRepairEvent
  | IncrementalNativeExtensionEvent
  | IncrementalAcceptedRevisionEvent;
export interface IncrementalConnectionSourceReplay {
  source: WorkflowConnectionSessionSource;
  epochs: Map<string, WorkflowConnectionSessionSource>;
  lastSession?: WorkflowConnectionSession;
}
export interface IncrementalRevisionProgress {
  phase: 'requested' | 'candidate' | 'reviewed' | 'rejected' | 'adopted';
  sessionId: string;
  modelInvocations: number;
  rejectedProposals: number;
  impact?: WorkflowConnectionRevisionImpact;
}
export interface IncrementalConnectionRevisionPlanning {
  model: BaseChatModel;
  observe?: (progress: IncrementalRevisionProgress) => void | Promise<void>;
}
