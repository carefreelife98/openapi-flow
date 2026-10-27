import type {
  BaseCheckpointSaver,
  CompiledStateGraph,
} from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';
import type { IncrementalConnectionRevisionPlanning } from './incremental-revisions.js';
import type { IncrementalMaterialArgumentPlanning } from './incremental-material-arguments.js';
import type {
  WorkflowConnectionSessionSource,
  WorkflowConnectionSession,
  WorkflowConnectionInspection,
  NativeInstanceOwnership,
  NativeInstanceSelectionInput,
  NativeInstanceSelection,
  NativeInstanceDependencyPlan,
  ReadyNativeNodeParameters,
  WorkflowConnectionMaterialRequest,
  WorkflowConnectionMaterialExtension,
  WorkflowConnectionStepExpectation,
  WorkflowConnectionSourceRepairRequest,
  WorkflowConnectionMaterialReplacement,
  WorkflowConnectionMaterialRepairWorkSubmission,
  WorkflowConnectionOutline,
  WorkflowConnectionOutlineDescription,
  WorkflowConnectionRejectedProposal,
} from '@openapi-flow/core';
import type {
  incrementalConnectionPolicySchema,
  incrementalConnectionStateSchema,
} from '../schemas/incremental-connection-state-schema.js';

export type IncrementalConnectionPolicy = z.infer<
  typeof incrementalConnectionPolicySchema
>;
export type IncrementalConnectionState =
  typeof incrementalConnectionStateSchema.State;
export type IncrementalConnectionUpdate =
  typeof incrementalConnectionStateSchema.Update;
export type IncrementalConnectionGraph = CompiledStateGraph<
  IncrementalConnectionState,
  IncrementalConnectionUpdate,
  string,
  typeof incrementalConnectionStateSchema,
  typeof incrementalConnectionStateSchema
>;

export interface IncrementalConnectionDependencies {
  model: BaseChatModel;
  /** Reconstruct the current source from host-owned materials; never store a function in state. */
  source: () => WorkflowConnectionSessionSource;
  policy: IncrementalConnectionPolicy;
  checkpointer?: BaseCheckpointSaver;
  observe?: (progress: IncrementalConnectionProgress) => void | Promise<void>;
  nativeAugmentation?: IncrementalNativeAugmentationPolicy;
  materialRecovery?: IncrementalConnectionMaterialRecovery;
  /** Independent initial goal/material coverage judgment, not final graph correctness proof. */
  initialGoalReview?: IncrementalInitialGoalReview;
  outlinePlanning?: IncrementalConnectionOutlinePlanning;
  revisionPlanning?: IncrementalConnectionRevisionPlanning;
}
export interface IncrementalOutlineSelectionInput extends WorkflowConnectionOutlineDescription {
  rejectedProposals: WorkflowConnectionRejectedProposal[];
}
export interface IncrementalConnectionOutlinePlanning {
  model: BaseChatModel;
  /** Host-owned planning-task scheduling, never execution edges or API order. */
  selectBundle: (input: IncrementalOutlineSelectionInput) => string;
  observe?: (outline: WorkflowConnectionOutline) => void | Promise<void>;
}
export interface IncrementalInitialGoalReview {
  model: BaseChatModel;
}
export interface IncrementalConnectionMaterialRecoveryInput {
  source: WorkflowConnectionSessionSource;
  request: WorkflowConnectionSourceRepairRequest;
  model: BaseChatModel;
  signal: AbortSignal;
}
export interface IncrementalConnectionRecoveryProgress {
  phase: 'requested' | 'replanned' | 'applied';
  targets: WorkflowConnectionSourceRepairRequest['request']['targets'];
  modelInvocations: number;
  rejectedProposals: number;
}
export interface IncrementalConnectionMaterialRecovery {
  /** Optional per-API dependent-value stages after the callback returns its binding replacement. */
  argumentPlanning?: IncrementalMaterialArgumentPlanning;
  /** Explicit structured-output invocation lease, charged to the shared run budget before dispatch. */
  modelInvocations: number;
  replan: (
    input: IncrementalConnectionMaterialRecoveryInput,
  ) => Promise<
    | WorkflowConnectionMaterialReplacement
    | WorkflowConnectionMaterialRepairWorkSubmission
  >;
  observe?: (
    progress: IncrementalConnectionRecoveryProgress,
  ) => void | Promise<void>;
}
export interface IncrementalConnectionModelLease {
  model: BaseChatModel;
  usedInvocations: () => number;
  close: () => void;
}
export interface IncrementalNativeAugmentationPolicy {
  /** Explicit host ownership policy. Literal means plan-time settings, not guessed API data. */
  parameterOwnership: NativeInstanceOwnership;
  includeExplanations?: boolean;
}
export interface IncrementalNativeMaterialReceipt {
  request: WorkflowConnectionMaterialRequest;
  selection: NativeInstanceSelection;
  dependencies: NativeInstanceDependencyPlan;
  result: ReadyNativeNodeParameters;
  extension: Pick<
    WorkflowConnectionMaterialExtension,
    'previous' | 'addedNativeNodeIds'
  >;
}
export interface IncrementalNativePlanningInput {
  input: NativeInstanceSelectionInput;
  request: WorkflowConnectionMaterialRequest;
  expected: WorkflowConnectionStepExpectation;
}
export interface IncrementalConnectionStageRuntime {
  check: (state: IncrementalConnectionState, config?: RunnableConfig) => void;
  invokeModelStage: (
    execute: () => Promise<IncrementalConnectionUpdate>,
  ) => Promise<IncrementalConnectionUpdate>;
}
export interface IncrementalConnectionProgress {
  phase: NonNullable<IncrementalConnectionState['status']>;
  sessionId: WorkflowConnectionSession['id'];
  revision: WorkflowConnectionSession['revision'];
  sourceFingerprint: WorkflowConnectionSession['sourceFingerprint'];
  nodeIds: string[];
  edges: WorkflowConnectionSession['edges'];
  rootNodeIds: WorkflowConnectionSession['rootNodeIds'];
  pendingNodeIds: WorkflowConnectionInspection['pendingNodeIds'];
  ready: WorkflowConnectionInspection['ready'];
  modelInvocations: number;
  rejectedProposals: number;
}
export interface IncrementalConnectionInvocationInput {
  state: IncrementalConnectionState;
  policy: IncrementalConnectionPolicy;
  config?: RunnableConfig;
}
export interface IncrementalConnectionLimitFailure {
  kind: 'model-invocations' | 'rejected-proposals' | 'deadline';
  limit: number;
  observed: number;
}
export interface IncrementalConnectionRuntimeFailure {
  id: string;
  error: unknown;
}
