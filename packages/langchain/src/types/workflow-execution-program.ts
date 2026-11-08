import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowExecutionProgramSource,
  WorkflowExecutionProgramDescription,
  ResolvedWorkflowExecutionProgram,
  WorkflowConnectionMaterialRepairRequest,
} from '@openapi-flow/core';
import type { z } from 'zod';
import type { workflowProgramReviewSchema } from '../schemas/workflow-program-review-schema.js';

export interface PlanWorkflowExecutionProgramInput extends WorkflowExecutionProgramSource {
  model: BaseChatModel;
  signal?: AbortSignal;
  /** Current typed failure only; not a new requirement or an authority to change source values. */
  feedback?: WorkflowProgramFeedback;
}
export interface WorkflowProgramFeedback {
  sourceFingerprint: string;
  previousProgram?: ResolvedWorkflowExecutionProgram['program'];
  reason: string;
}
export interface ReviewWorkflowExecutionProgramInput extends Omit<
  PlanWorkflowExecutionProgramInput,
  'feedback'
> {
  result: ResolvedWorkflowExecutionProgram;
}
export type WorkflowProgramReviewOutput = z.infer<
  typeof workflowProgramReviewSchema
>;
export interface WorkflowProgramReview {
  sourceFingerprint: string;
  program: ResolvedWorkflowExecutionProgram['program'];
  review: WorkflowProgramReviewOutput;
}
export interface InvokeWorkflowProgramModelInput<Output extends object> {
  input: PlanWorkflowExecutionProgramInput;
  description: WorkflowExecutionProgramDescription;
  schema: z.ZodType<Output>;
  name: string;
  operation: string;
  prompt: string;
  result?: ResolvedWorkflowExecutionProgram;
}
export interface WorkflowProgramPlanningFailure {
  operation: string;
  sourceFingerprint: string;
  stage: 'model-output' | 'contract-validation';
  output: unknown;
  cause: unknown;
}
export interface WorkflowProgramReviewMaterialSelection {
  decision: WorkflowConnectionMaterialRepairRequest;
}
