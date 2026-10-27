import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { z } from 'zod';
import type { NativePlanningRejectedProposal } from './native-planning-rejection.js';
import type {
  JsonValueObject,
  NativeNodePlanningInput,
  NativePlanningProposal,
  NativePlanningResult,
  NativePlanningAssessment,
  NativePlanningCapabilityMaterial,
  NativeNodePlanningRecord,
  NativeInstanceSelectionInput,
  NativeNodeConfigurationInput,
  NativeSelectedPlanningInput,
  NativeInstanceSelectionFeedback,
} from '@openapi-flow/core';

export interface PlanNativeNodesInput extends NativeNodePlanningInput {
  model?: BaseChatModel;
  includeExplanations?: boolean;
}

export type NativeNodeProposal = NativePlanningProposal;

export type { NativePlanningCapabilityMaterial } from '@openapi-flow/core';

export interface NativeLiteralNodeOutput {
  id: string;
  capability: string;
  parameters: JsonValueObject;
}
export interface NativeOwnedLiteralNodeOutput extends NativeLiteralNodeOutput {
  parameterSource: 'literal';
}
export interface NativeRuntimeNodeOutput {
  id: string;
  capability: string;
  parameterSource: 'workflow-input';
}
export type NativeNodeModelInstance =
  | NativeLiteralNodeOutput
  | NativeOwnedLiteralNodeOutput
  | NativeRuntimeNodeOutput;
export interface NativeNodeModelProposal {
  nativeNodes: NativeNodeModelInstance[];
  gaps: NativePlanningProposal['gaps'];
}

/** Used only when code proves that no offered capability has a parameter choice in this call. */
export type NativeNodeGapOnlyOutput = Pick<NativePlanningProposal, 'gaps'>;

export interface ExplainedNativeNodeProposal {
  node: NativeNodeModelInstance;
  reason: string;
}

export interface ExplainedNativeNodePlanningOutput {
  decision:
    | {
        additions: ExplainedNativeNodeProposal[];
        gaps: NativePlanningProposal['gaps'];
      }
    | { noAdditionalNodesReason: string; gaps: NativePlanningProposal['gaps'] };
}

export type NativeNodePlanningOutput =
  | NativeNodeModelProposal
  | ExplainedNativeNodePlanningOutput
  | NativeNodeGapOnlyOutput;

export interface ResolvedNativeNodePlanningOutput {
  proposal: NativeNodeProposal;
  assessment?: NativePlanningAssessment;
}

export interface NativeNodeParameterContract {
  schemas: z.ZodType<NativeNodeModelInstance>[];
  material: NativePlanningCapabilityMaterial;
}

export interface NativeNodePlanningContract {
  schema: z.ZodType<NativeNodePlanningOutput>;
  capabilities: NativePlanningCapabilityMaterial[];
}

export interface NativeNodePlan extends NativePlanningResult {
  nativePlanning?: NativeNodePlanningRecord;
}

export type NativeNodePlanningFailure =
  | {
      stage:
        | 'instance-selection'
        | 'dependency-plan'
        | 'parameter-schema'
        | 'parameter-validation';
      output: unknown;
      requestFingerprint?: string;
    }
  | { stage: 'proposal-schema'; output: unknown }
  | {
      stage: 'node-validation';
      output: NativeNodeProposal;
      sourceOutput?: NativeNodePlanningOutput;
    };

export interface SelectNativeNodeInstancesInput extends NativeInstanceSelectionInput {
  model?: BaseChatModel;
  signal?: AbortSignal;
  /** Explicit independently reviewed rejection. Never causes a hidden retry. */
  feedback?: NativeInstanceSelectionFeedback;
  /** Explicit same-source contract rejections. No library-owned retry is performed. */
  rejectedProposals?: NativePlanningRejectedProposal[];
}

export interface GenerateNativeNodeParametersInput extends NativeNodeConfigurationInput {
  model?: BaseChatModel;
  signal?: AbortSignal;
}

export interface PlanNativeInstanceDependenciesInput extends NativeSelectedPlanningInput {
  model?: BaseChatModel;
  signal?: AbortSignal;
}
