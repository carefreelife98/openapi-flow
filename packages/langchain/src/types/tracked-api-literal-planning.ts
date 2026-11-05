import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ApiLiteralGenerationDescription,
  WorkflowSourceMessage,
  WorkflowConnectionApiRepairDescription,
} from '@openapi-flow/core';
import type {
  ApiArgumentRejection,
  ApiLiteralGenerationOptions,
  ApiLiteralGenerationOutput,
  ApiLiteralGenerationOutputSchema,
} from './argument-generation.js';

export interface TrackedApiLiteralPlanningInput extends ApiLiteralGenerationDescription {
  model: BaseChatModel;
  assertSourceUnchanged: () => void;
  messages: WorkflowSourceMessage[];
  options: ApiLiteralGenerationOptions;
  sourceFingerprint: string;
  signal?: AbortSignal;
  rejectedProposals?: ApiArgumentRejection[];
  materialRepair?: WorkflowConnectionApiRepairDescription;
}
export interface TrackedApiLiteralPlanningResult {
  proposal: ApiLiteralGenerationOutput;
  validationSchema: ApiLiteralGenerationOutputSchema;
}
