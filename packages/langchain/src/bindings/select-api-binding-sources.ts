import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeApiCallBindingPlanning,
  describeApiLiteralJsonSources,
  resolveApiBindingSourceSelection,
  runOpenApiFlowOperation,
  describeWorkflowConnectionApiRepair,
} from '@openapi-flow/core';
import type { ApiBindingSourceSelection } from '@openapi-flow/core';
import type {
  SelectApiBindingSourcesInput,
  ApiBindingSourceDecisionOutput,
} from '../types/api-call-binding-planning.js';
import { createApiBindingSourceDecisionSchema } from '../schemas/api-call-binding-plan-schema.js';
import { createApiBindingSourceProposal } from './create-api-binding-source-proposal.js';
import { apiBindingSourcesPrompt } from '../prompts/api-call-bindings-prompt.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { apiMaterialRepairPrompt } from '../prompts/api-material-repair-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';

export async function selectApiBindingSources(
  input: SelectApiBindingSourcesInput,
): Promise<ApiBindingSourceSelection> {
  const { description, materialRepair } = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'selectApiBindingSources',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => ({
      description: describeApiCallBindingPlanning(input),
      materialRepair:
        input.materialRepair === undefined
          ? undefined
          : describeWorkflowConnectionApiRepair({
              stage: 'api-bindings',
              repair: input.materialRepair,
              planning: input,
            }),
    }),
  );
  input.signal?.throwIfAborted();
  if (Object.keys(description.requestSchema.properties as object).length === 0)
    return resolveApiBindingSourceSelection({
      ...description.input,
      proposal: {
        sourceNodeIds: [],
        gaps: [],
        ...(input.includeExplanations === true
          ? { reason: 'The original OAS declares no request inputs to bind.' }
          : {}),
      },
    });
  const schema = createApiBindingSourceDecisionSchema(description);
  const output = await invokeStructuredModel<ApiBindingSourceDecisionOutput>({
    model: input.model,
    schema: serializeStructuredOutputSchema(schema, 'draft-2020-12'),
    operation: 'selectApiBindingSources',
    name: 'select_api_binding_sources',
    method: 'functionCalling',
    strict: true,
    signal: input.signal,
    messages: [
      new SystemMessage(
        materialRepair === undefined
          ? apiBindingSourcesPrompt
          : [apiBindingSourcesPrompt, apiMaterialRepairPrompt].join('\n'),
      ),
      new HumanMessage(
        JSON.stringify({
          scenario: description.input.scenario,
          target: description.target,
          requestSchema: description.requestSchema,
          sourceCandidates: description.sourceCandidates,
          ...(description.input.literalSourceMessages === undefined
            ? {}
            : {
                literalSourceMessages: description.input.literalSourceMessages,
                literalJsonSources: describeApiLiteralJsonSources(
                  description.input.literalSourceMessages,
                ),
              }),
          ...(materialRepair === undefined ? {} : { materialRepair }),
        }),
      ),
    ],
  });
  input.signal?.throwIfAborted();
  return runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'selectApiBindingSources',
      stage: 'contract-validation',
      code: 'API_BINDING_VALIDATION_FAILED',
    },
    () => {
      if (
        !isDeepStrictEqual(
          input.literalSourceMessages,
          description.input.literalSourceMessages,
        )
      )
        throw new Error(
          'Binding literalSourceMessages changed during source selection',
        );
      if (
        materialRepair !== undefined &&
        (input.materialRepair === undefined ||
          !isDeepStrictEqual(
            materialRepair,
            describeWorkflowConnectionApiRepair({
              stage: 'api-bindings',
              repair: input.materialRepair,
              planning: input,
            }),
          ))
      )
        throw new Error(
          'API material repair feedback changed during source selection',
        );
      return resolveApiBindingSourceSelection({
        ...description.input,
        proposal: createApiBindingSourceProposal(
          parseStructuredOutput(
            createApiBindingSourceDecisionSchema(description, false),
            output,
            'API binding source decision',
          ),
          description.input.literalSourceMessages,
        ),
      });
    },
  );
}
