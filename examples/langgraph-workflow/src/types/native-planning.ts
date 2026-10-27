import type {
  NativeNodeConfigurationReply,
  NativeNodeParameterResult,
  PlannedNativeNode,
} from '@openapi-flow/core';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { N8nNativeInputConfiguration } from '@openapi-flow/n8n';
import type { PlannedGraphDependencies } from './workflow-graph.js';
import type { NativeSelectionPlanningOptions } from './native-selection-planning.js';

export interface StagedNativePlanningOptions {
  mode: 'staged';
  allowRuntimeParameters?: boolean;
  /** Explicit producer-choice stage before per-instance value generation. */
  planDependencies?: boolean;
  /** Explicit host-owned selection/review loop, not an implicit planner retry. */
  selectionReview?: NativeSelectionPlanningOptions;
}

/** One configuration source stays immutable while its question is pending. */
export interface HostNativeConfigurationTask {
  nodeId: string;
  configuredNodes: PlannedNativeNode[];
  replies: NativeNodeConfigurationReply[];
  result?: NativeNodeParameterResult;
}

export interface NativePlanningGraphDependencies extends PlannedGraphDependencies {
  nativePlanning?: StagedNativePlanningOptions;
  nativeInputs?: N8nNativeInputConfiguration;
  checkpointer?: BaseCheckpointSaver;
}
