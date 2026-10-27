import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { GenerateApiArgumentsInput } from '@openapi-flow/langchain';
import type { ApiCallArguments } from '@openapi-flow/core';
import type { z } from 'zod';
import type {
  apiArgumentPlanningStateSchema,
  apiArgumentPlanningPolicySchema,
} from '../schemas/api-argument-planning-state-schema.js';

export type ApiArgumentPlanningSource = Omit<
  GenerateApiArgumentsInput,
  'model' | 'signal' | 'rejectedProposals'
>;
export type ApiArgumentPlanningPolicy = z.infer<
  typeof apiArgumentPlanningPolicySchema
>;
export type ApiArgumentPlanningState =
  typeof apiArgumentPlanningStateSchema.State;
export type ApiArgumentPlanningUpdate =
  typeof apiArgumentPlanningStateSchema.Update;

export interface ApiArgumentPlanningProgress extends Pick<
  ApiCallArguments,
  'callId'
> {
  phase: 'started' | 'rejected' | 'completed';
  attempts: number;
  rejectedProposals: number;
}

export type ApiArgumentPlanningObserver = (
  progress: ApiArgumentPlanningProgress,
  signal: AbortSignal,
) => void | Promise<void>;

export interface ApiArgumentPlanningOptions {
  policy: ApiArgumentPlanningPolicy;
  checkpointer?: BaseCheckpointSaver;
  observe?: ApiArgumentPlanningObserver;
}

export interface ApiArgumentPlanningDependencies extends ApiArgumentPlanningOptions {
  model: BaseChatModel;
  source: () => ApiArgumentPlanningSource;
}

export interface ApiArgumentPlanningInvocation {
  state: ApiArgumentPlanningState;
  policy: ApiArgumentPlanningPolicy;
  config?: RunnableConfig;
  cause?: unknown;
}

export interface ApiArgumentPlanningLimitFailure {
  kind: 'attempts' | 'rejected-proposals' | 'deadline';
  limit: number;
  observed: number;
}

export interface ApiArgumentPlanningRuntimeFailure {
  id: string;
  error: unknown;
}
