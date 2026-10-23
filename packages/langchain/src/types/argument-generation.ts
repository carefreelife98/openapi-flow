import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ApiLiteralGenerationInput,
  ApiCallArguments,
  ApiArgumentProposal,
  ApiArgumentGenerationContract,
  ApiArgumentProposalSchemaShape,
  createApiRequestInputPointerSchema,
  ApiLiteralProposalSource,
} from '@openapi-flow/core';
import type { z } from 'zod';
import type { createApiLiteralGenerationOutputSchema } from '../schemas/api-literal-generation-output-schema.js';
import type { apiLiteralGenerationReasonSchema } from '../schemas/api-literal-generation-output-schema.js';
import type { apiLiteralGenerationSourcesSchema } from '../schemas/api-literal-generation-output-schema.js';

export interface GenerateApiArgumentsInput extends ApiLiteralGenerationInput {
  model?: BaseChatModel;
  includeExplanations?: boolean;
  selectOasEnums?: boolean;
  trackRequestedInputs?: boolean;
}

export interface InterpretApiArgumentEnumsInput extends GenerateApiArgumentsInput {
  arguments: ApiCallArguments;
  proposal: ApiArgumentProposal;
  literalSources: ApiLiteralProposalSource[];
}

export type ApiLiteralGenerationOutput = z.infer<
  ReturnType<typeof createApiLiteralGenerationOutputSchema>
>;

export type ApiLiteralGenerationRequestedShape = {
  requestedInputs: z.ZodArray<
    ReturnType<typeof createApiRequestInputPointerSchema>
  >;
  literalSources: typeof apiLiteralGenerationSourcesSchema;
};

export type ApiLiteralGenerationExplanationShape = {
  explanation: typeof apiLiteralGenerationReasonSchema;
};

export type ApiLiteralGenerationOutputSchema =
  | ApiArgumentGenerationContract['schema']
  | z.ZodObject<
      ApiArgumentProposalSchemaShape & ApiLiteralGenerationRequestedShape,
      z.core.$strict
    >
  | z.ZodObject<
      ApiArgumentProposalSchemaShape & ApiLiteralGenerationExplanationShape,
      z.core.$strict
    >
  | z.ZodObject<
      ApiArgumentProposalSchemaShape &
        ApiLiteralGenerationRequestedShape &
        ApiLiteralGenerationExplanationShape,
      z.core.$strict
    >;
