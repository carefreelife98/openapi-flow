import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { ApiSelection } from '@openapi-flow/core';
import {
  describeApiSelectionContext,
  createApiSelectionExplanation,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type {
  ApiSelectionOutput,
  SelectApiOperationsInput,
} from '../types/operation-selection.js';
import { createApiSelectionSchema } from '../schemas/api-selection-schema.js';
import { operationSelectionPrompt } from '../prompts/operation-selection-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { resolveApiSelectionOptions } from './resolve-api-selection-options.js';
import { apiSelectionExplanationPrompt } from '../prompts/api-selection-explanation-prompt.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';

export async function selectApiOperations(
  input: SelectApiOperationsInput,
): Promise<ApiSelection> {
  const { scenario, model } = input;
  const { includeExplanations, context } = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'selectApiOperations',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      assertSelectionInput(scenario, model);
      if (!Array.isArray(input.operations))
        throw new Error('operations must be an array');
      return {
        includeExplanations: resolveApiSelectionOptions({
          includeExplanations: input.includeExplanations,
        }),
        context: describeApiSelectionContext({
          scenario,
          operations: input.operations,
        }),
      };
    },
  );
  const { operations } = context;
  if (operations.length === 0)
    return {
      operations: [],
      gaps: [
        {
          kind: 'missing_operation',
          description:
            'Supplied documents contain no REST operation candidates.',
        },
      ],
    };
  const candidates = operations.map((operation, index) => ({
    ...operation,
    candidateId: `candidate-${index + 1}`,
  }));
  const schema = createApiSelectionSchema(
    candidates.map((candidate) => candidate.candidateId),
    includeExplanations,
  );
  const proposed = await invokeStructuredModel<ApiSelectionOutput>({
    model,
    schema,
    operation: 'selectApiOperations',
    name: 'select_api_operations',
    method: 'jsonSchema',
    messages: [
      new SystemMessage(
        `${operationSelectionPrompt}\n${apiSelectionExplanationPrompt}`,
      ),
      new HumanMessage(JSON.stringify({ scenario, candidates })),
    ],
  });
  return runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'selectApiOperations',
      stage: 'contract-validation',
      code: 'API_SELECTION_INVALID',
    },
    () => {
      const selection = parseStructuredOutput(
        schema,
        proposed,
        'model API selection',
      );
      if (selection.operations.length === 0 && selection.gaps.length === 0)
        throw new Error('model API selection must contain operations or gaps');
      const byId = new Map(
        candidates.map((candidate) => [candidate.candidateId, candidate]),
      );
      return {
        operations: selection.operations.map((item) => {
          const candidate = byId.get(item.candidateId);
          if (!candidate)
            throw new Error(
              `model API selection references unknown ${item.candidateId}`,
            );
          return {
            key: { ...candidate.key },
            purpose: item.purpose,
            ...('explanation' in item
              ? {
                  explanation: createApiSelectionExplanation({
                    context,
                    basis: { kind: 'candidates', operations: [candidate.key] },
                    reason: item.explanation.reason,
                  }),
                }
              : {}),
          };
        }),
        gaps: selection.gaps.map((gap) => ({
          kind: 'missing_operation',
          description: gap.description,
          ...('explanation' in gap
            ? {
                explanation: createApiSelectionExplanation({
                  context,
                  basis: { kind: 'catalog' },
                  reason: gap.explanation.reason,
                }),
              }
            : {}),
        })),
      };
    },
  );
}
