import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ApiLiteralGenerationInput,
  ApiArgumentGenerationContract,
  ApiArgumentProposalSchemaShape,
} from '@openapi-flow/core';
import type { z } from 'zod';
import type { createApiLiteralGenerationOutputSchema } from '../schemas/api-literal-generation-output-schema.js';
import type { apiLiteralGenerationReasonSchema } from '../schemas/api-literal-generation-output-schema.js';

export interface GenerateApiArgumentsInput extends ApiLiteralGenerationInput {
  model?: BaseChatModel;
  includeExplanations?: boolean;
}

export type ApiLiteralGenerationOutput = z.infer<
  ReturnType<typeof createApiLiteralGenerationOutputSchema>
>;

export type ApiLiteralGenerationOutputSchema =
  | ApiArgumentGenerationContract['schema']
  | z.ZodObject<
      ApiArgumentProposalSchemaShape & {
        explanation: typeof apiLiteralGenerationReasonSchema;
      },
      z.core.$strict
    >;
