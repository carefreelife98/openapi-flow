import { z } from 'zod';
import type { JsonObject } from '@openapi-flow/core';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  createApiRequestSchema,
  describeApiLiteralJsonSources,
  listApiRequestInputRoots,
  describeApiLiteralTargets,
  listApiLiteralContainerTargets,
} from '@openapi-flow/core';
import type { ApiLiteralGenerationOutput } from '../types/argument-generation.js';
import type {
  TrackedApiLiteralPlanningInput,
  TrackedApiLiteralPlanningResult,
} from '../types/tracked-api-literal-planning.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { createApiLiteralConstructionPlanSchema } from '../schemas/api-literal-construction-plan-schema.js';
import { apiLiteralConstructionPrompt } from '../prompts/api-literal-construction-prompt.js';
import { apiArgumentReplanningPrompt } from '../prompts/api-arguments-prompt.js';
import { describeApiLiteralSourceChoices } from './describe-api-literal-source-choices.js';
import { apiMaterialRepairPrompt } from '../prompts/api-material-repair-prompt.js';

/** One source-backed construction proposal. Core validates the complete plan before acceptance. */
export async function generateTrackedApiLiterals(
  input: TrackedApiLiteralPlanningInput,
): Promise<TrackedApiLiteralPlanningResult> {
  const requestSchema = createApiRequestSchema(input.input);
  const declaredTargets = listApiRequestInputRoots(
    z.toJSONSchema(input.contract.valuesSchema) as JsonObject,
  ).flatMap((pointer) => describeApiLiteralTargets(input.contract, [pointer]));
  const constructionRoots = listApiLiteralContainerTargets(declaredTargets);
  const schema = createApiLiteralConstructionPlanSchema(
    requestSchema,
    input.messages,
    input.options.includeExplanations === true,
    true,
    declaredTargets,
    constructionRoots,
  );
  const proposal = await invokeStructuredModel<ApiLiteralGenerationOutput>({
    model: input.model,
    schema: serializeStructuredOutputSchema(schema, 'draft-2020-12'),
    operation: 'generateApiArguments',
    name: 'generate_api_arguments',
    method: 'functionCalling',
    strict: undefined,
    signal: input.signal,
    messages: [
      new SystemMessage(
        [
          apiLiteralConstructionPrompt,
          ...(input.rejectedProposals === undefined
            ? []
            : [apiArgumentReplanningPrompt]),
          ...(input.materialRepair === undefined
            ? []
            : [apiMaterialRepairPrompt]),
        ].join('\n'),
      ),
      new HumanMessage(
        JSON.stringify({
          ...input.context,
          ...(constructionRoots.length
            ? {
                literalJsonSources: describeApiLiteralJsonSources(
                  input.messages,
                ),
                constructionRoots,
              }
            : {}),
          declaredLiteralSourceChoices: describeApiLiteralSourceChoices(
            input.messages,
            declaredTargets,
          ),
          ...(input.rejectedProposals === undefined
            ? {}
            : { rejectedProposals: input.rejectedProposals }),
          ...(input.materialRepair === undefined
            ? {}
            : { materialRepair: input.materialRepair }),
          ...(input.options.selectOasEnums === true
            ? { selectOasEnums: true }
            : {}),
        }),
      ),
    ],
  });
  input.assertSourceUnchanged();
  return {
    proposal,
    validationSchema: createApiLiteralConstructionPlanSchema(
      requestSchema,
      input.messages,
      input.options.includeExplanations === true,
      false,
      declaredTargets,
      constructionRoots,
    ),
  };
}
