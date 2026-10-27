import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { z } from 'zod';
import type {
  NativeInstanceSelectionInput,
  NativeInstanceSelectionContext,
  NativeInstanceSelection,
  NativeInstanceSelectionReview,
  WorkflowCapability,
} from '@openapi-flow/core';
import type {
  nativeSelectionPlanningPolicySchema,
  nativeSelectionPlanningStateSchema,
} from '../schemas/native-selection-planning-state-schema.js';

export type NativeSelectionPlanningSource = Omit<
  NativeInstanceSelectionInput,
  'capabilities'
>;
export interface NativeSelectionPlanningSnapshot {
  source: NativeSelectionPlanningSource;
  context: NativeInstanceSelectionContext;
}
export type NativeSelectionPlanningPolicy = z.infer<
  typeof nativeSelectionPlanningPolicySchema
>;
export type NativeSelectionPlanningState =
  typeof nativeSelectionPlanningStateSchema.State;
export type NativeSelectionPlanningUpdate =
  typeof nativeSelectionPlanningStateSchema.Update;
export interface NativeSelectionPlanningProgress {
  phase:
    | 'selected'
    | 'repeated-selection'
    | 'reviewed'
    | 'ready'
    | 'blocked'
    | 'selection-rejected'
    | 'review-rejected';
  modelInvocations: number;
  reselections: number;
  reportedGaps: number;
  reviewStatus?: NativeInstanceSelectionReview['status'];
}
export interface NativeSelectionPlanningOptions {
  policy: NativeSelectionPlanningPolicy;
  observe?: NativeSelectionPlanningObserver;
}
export type NativeSelectionPlanningObserver = (
  progress: NativeSelectionPlanningProgress,
) => void | Promise<void>;
export interface NativeSelectionPlanningDependencies extends NativeSelectionPlanningOptions {
  capabilities: WorkflowCapability[];
  model?: BaseChatModel;
  now: () => number;
  checkpointer?: BaseCheckpointSaver;
}
export type NativeSelectionPlanningReceipt = Required<
  Pick<
    NativeSelectionPlanningState,
    'status' | 'modelInvocations' | 'reselections' | 'reviews'
  >
>;
export interface NativeSelectionPlanningLimitFailure {
  kind: 'model-invocations' | 'reselections' | 'deadline';
  limit: number;
  observed: number;
}
export interface NativeSelectionPlanningStoppedFailure {
  selection: NativeInstanceSelection;
  receipt: NativeSelectionPlanningReceipt;
}
