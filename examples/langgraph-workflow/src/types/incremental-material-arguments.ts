import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ApiCallArguments,
  WorkflowConnectionMaterialRepairWork,
  WorkflowConnectionMaterialReplacement,
  WorkflowConnectionMaterialRepairInputInspection,
} from '@openapi-flow/core';

/** Host-owned task checkpoint, not an adopted material or a model-generated schedule. */
export interface IncrementalMaterialArgumentWork {
  work: WorkflowConnectionMaterialRepairWork;
  pendingReplacement: WorkflowConnectionMaterialReplacement;
  completedArguments: ApiCallArguments[];
}

export interface IncrementalMaterialArgumentProgress {
  callId: ApiCallArguments['callId'];
  completed: number;
  total: number;
  modelInvocations: number;
}

export interface IncrementalMaterialArgumentPlanning {
  model: BaseChatModel;
  /** Explicit host input policy evaluated against actual values; never supplies values. */
  selectDeferredApiInputIds?: (
    inspection: WorkflowConnectionMaterialRepairInputInspection,
    proposedDeferredApiInputIds: string[] | undefined,
  ) => string[];
  observe?: (
    progress: IncrementalMaterialArgumentProgress,
  ) => void | Promise<void>;
}
