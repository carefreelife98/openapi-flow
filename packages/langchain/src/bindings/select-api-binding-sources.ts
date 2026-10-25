import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeApiCallBindingPlanning,
  resolveApiBindingSourceSelection,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type {
  ApiBindingSourceProposal,
  ApiBindingSourceSelection,
} from '@openapi-flow/core';
import type { SelectApiBindingSourcesInput } from '../types/api-call-binding-planning.js';
import { createApiBindingSourceSelectionSchema } from '../schemas/api-call-binding-plan-schema.js';
import { apiBindingSourcesPrompt } from '../prompts/api-call-bindings-prompt.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

export async function selectApiBindingSources(
  input: SelectApiBindingSourcesInput,
): Promise<ApiBindingSourceSelection> {
  const description = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'selectApiBindingSources',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => describeApiCallBindingPlanning(input),
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
  const schema = createApiBindingSourceSelectionSchema(description);
  const output = await invokeStructuredModel<ApiBindingSourceProposal>({
    model: input.model,
    schema,
    operation: 'selectApiBindingSources',
    name: 'select_api_binding_sources',
    method: 'functionCalling',
    signal: input.signal,
    messages: [
      new SystemMessage(apiBindingSourcesPrompt),
      new HumanMessage(
        JSON.stringify({
          scenario: description.input.scenario,
          target: description.target,
          requestSchema: description.requestSchema,
          sourceCandidates: description.sourceCandidates,
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
    () =>
      resolveApiBindingSourceSelection({
        ...description.input,
        proposal: parseStructuredOutput(
          schema,
          output,
          'API binding source selection',
        ),
      }),
  );
}
