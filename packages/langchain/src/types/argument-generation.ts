import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ApiLiteralGenerationInput,
  ApiCallArguments,
  ApiArgumentProposal,
  ApiLiteralProposalSource,
  OpenApiFlowError,
  WorkflowConnectionApiRepairContext,
  ApiInputLiteralSource,
  ApiArgumentEnumContextInput,
} from '@openapi-flow/core';
import type { z } from 'zod';
import type { apiLiteralGenerationReasonSchema } from '../schemas/api-literal-generation-output-schema.js';
import type { apiLiteralNotProvidedSchema } from '../schemas/api-literal-generation-output-schema.js';
import type {
  createApiLiteralProvidedSchema,
  createApiTrackedLiteralGenerationSchema,
  createApiExplainedTrackedLiteralGenerationSchema,
  createApiEnumIntentInputsSchema,
} from '../schemas/api-literal-generation-output-schema.js';
import type { apiLiteralGenerationOptionsSchema } from '../schemas/api-literal-generation-output-schema.js';
import type { apiArgumentRejectionSchema } from '../schemas/api-argument-rejection-schema.js';

export interface GenerateApiArgumentsInput extends ApiLiteralGenerationInput {
  model?: BaseChatModel;
  includeExplanations?: boolean;
  selectOasEnums?: boolean;
  trackRequestedInputs?: boolean;
  /** Exact, private rejection feedback for the same source; no library-owned retries. */
  rejectedProposals?: ApiArgumentRejection[];
  signal?: AbortSignal;
  materialRepair?: WorkflowConnectionApiRepairContext;
}

export interface ApiLiteralGenerationSource extends ApiInputLiteralSource {
  targetPointer: string;
  /** Selected only when more than one original message is supplied. */
  messageId?: string;
}

export type ApiArgumentRejection = z.infer<typeof apiArgumentRejectionSchema>;

export interface CreateApiArgumentRejectionInput extends Omit<
  GenerateApiArgumentsInput,
  'model' | 'rejectedProposals' | 'signal'
> {
  error: unknown;
}

export type ApiLiteralGenerationOptions = z.infer<
  typeof apiLiteralGenerationOptionsSchema
>;

export interface ApiArgumentPlanningFailure {
  error: OpenApiFlowError;
  sourceFingerprint: string;
  output: unknown;
}

export interface InterpretApiArgumentEnumsInput
  extends
    GenerateApiArgumentsInput,
    Required<Pick<ApiArgumentEnumContextInput, 'enumIntentInputs'>> {
  arguments: ApiCallArguments;
  proposal: ApiArgumentProposal;
  literalSources: ApiLiteralProposalSource[];
}

export type ApiLiteralProvidedDecision = z.infer<
  ReturnType<typeof createApiLiteralProvidedSchema>
>;

export type ApiLiteralAvailabilityDecision =
  z.infer<typeof apiLiteralNotProvidedSchema> | ApiLiteralProvidedDecision;

export type ApiTrackedLiteralGenerationOutput = (
  | z.infer<ReturnType<typeof createApiTrackedLiteralGenerationSchema>>
  | z.infer<ReturnType<typeof createApiExplainedTrackedLiteralGenerationSchema>>
) &
  Partial<
    Record<
      'enumIntentInputs',
      z.infer<ReturnType<typeof createApiEnumIntentInputsSchema>>
    >
  >;

export interface ApiExplainedLiteralGenerationOutput extends ApiArgumentProposal {
  explanation?: z.infer<typeof apiLiteralGenerationReasonSchema>;
}

export type ApiLiteralGenerationOutput =
  | ApiArgumentProposal
  | ApiExplainedLiteralGenerationOutput
  | ApiTrackedLiteralGenerationOutput;

export type ApiLiteralGenerationOutputSchema =
  z.ZodType<ApiLiteralGenerationOutput>;

export interface ResolvedApiLiteralGenerationOutput
  extends
    ApiArgumentProposal,
    Pick<ApiArgumentEnumContextInput, 'enumIntentInputs'> {
  requestedInputs?: string[];
  literalSources?: ApiLiteralGenerationSource[];
  explanation?: z.infer<typeof apiLiteralGenerationReasonSchema>;
}
