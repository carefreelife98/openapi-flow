import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { ApiSelection } from '@openapi-flow/core';
import type {
  ApiSelectionOutput,
  SelectApiOperationsInput,
} from '../types/operation-selection.js';
import { createApiSelectionSchema } from '../schemas/api-selection-schema.js';
import { operationSelectionPrompt } from '../prompts/operation-selection-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

export async function selectApiOperations({
  operations,
  scenario,
  model,
}: SelectApiOperationsInput): Promise<ApiSelection> {
  assertSelectionInput(scenario, model);
  if (!Array.isArray(operations))
    throw new Error('operations must be an array');
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
    candidateId: `candidate-${index + 1}`,
    ...operation,
  }));
  const schema = createApiSelectionSchema(
    candidates.map((candidate) => candidate.candidateId),
  );
  const proposed: ApiSelectionOutput = await model
    .withStructuredOutput<ApiSelectionOutput>(schema, {
      name: 'select_api_operations',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(operationSelectionPrompt),
      new HumanMessage(JSON.stringify({ scenario, candidates })),
    ]);
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
      return { key: { ...candidate.key }, purpose: item.purpose };
    }),
    gaps: selection.gaps.map((gap) => ({
      kind: 'missing_operation',
      description: gap.description,
    })),
  };
}
