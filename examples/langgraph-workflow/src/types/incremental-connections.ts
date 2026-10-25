import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';
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

export interface IncrementalConnectionDependencies {
  model: BaseChatModel;
  /** Reconstruct the current source from host-owned materials; never store a function in state. */
  source: () => WorkflowConnectionSessionSource;
  policy: IncrementalConnectionPolicy;
  checkpointer?: BaseCheckpointSaver;
  observe?: (progress: IncrementalConnectionProgress) => void | Promise<void>;
  nativeAugmentation?: IncrementalNativeAugmentationPolicy;
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
export interface IncrementalNativeStageRuntime {
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
