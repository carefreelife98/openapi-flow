import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowApiArgumentContext,
  WorkflowApiArgumentRejection,
} from '@openapi-flow/core';

export interface GenerateWorkflowApiArgumentsInput extends WorkflowApiArgumentContext {
  model?: BaseChatModel;
  selectOasEnums?: boolean;
  signal?: AbortSignal;
  /** Current call failures only; never treated as an original input source. */
  rejectedCalls?: WorkflowApiArgumentRejection[];
}
