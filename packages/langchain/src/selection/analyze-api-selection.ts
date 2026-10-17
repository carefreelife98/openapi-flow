import { createHash } from 'node:crypto';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ApiSelectionAnalysis } from '@openapi-flow/core';
import type { SelectApiOperationsInput } from '../types/operation-selection.js';
import type { ApiSelectionAnalysisOutput } from '../types/api-selection-analysis.js';
import { createApiSelectionAnalysisSchema } from '../schemas/api-selection-analysis-schema.js';
import { apiSelectionAnalysisPrompt } from '../prompts/api-selection-analysis-prompt.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { selectApiOperations } from './select-api-operations.js';

/** Additive clarification boundary; the existing selector keeps its output contract. */
export async function analyzeApiSelection(
  input: SelectApiOperationsInput,
): Promise<ApiSelectionAnalysis> {
  assertSelectionInput(input.scenario, input.model);
  if (!Array.isArray(input.operations))
    throw new Error('operations must be an array');
  if (!input.operations.length)
    return { selection: await selectApiOperations(input), questions: [] };
  const candidates = input.operations.map((operation, index) => ({
    ...operation,
    candidateId: `candidate-${index + 1}`,
  }));
  const schema = createApiSelectionAnalysisSchema(
    candidates.map((item) => item.candidateId),
  );
  const proposed = await input.model
    .withStructuredOutput<ApiSelectionAnalysisOutput>(schema, {
      name: 'analyze_api_selection',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(apiSelectionAnalysisPrompt),
      new HumanMessage(
        JSON.stringify({ scenario: input.scenario, candidates }),
      ),
    ]);
  const parsed = parseStructuredOutput(
    schema,
    proposed,
    'model API selection analysis',
  );
  const byId = new Map(candidates.map((item) => [item.candidateId, item]));
  const selected = parsed.operations.map((item) => {
    const candidate = byId.get(item.candidateId);
    if (!candidate)
      throw new Error(`Unknown API candidate ${item.candidateId}`);
    return { key: structuredClone(candidate.key), purpose: item.purpose };
  });
  const questions = parsed.questions.map((question, index) => {
    if (new Set(question.candidateIds).size !== question.candidateIds.length)
      throw new Error('API alternatives must be distinct');
    const alternatives = question.candidateIds.map((id) => {
      const candidate = byId.get(id);
      if (!candidate) throw new Error(`Unknown API alternative ${id}`);
      return structuredClone(input.operations[candidates.indexOf(candidate)]);
    });
    return {
      kind: 'operation-choice' as const,
      id: createHash('sha256')
        .update(
          JSON.stringify([
            input.scenario,
            index,
            question.purpose,
            alternatives.map((item) => item.key),
          ]),
        )
        .digest('hex'),
      message: question.message,
      purpose: question.purpose,
      candidates: alternatives,
    };
  });
  if (!selected.length && !questions.length && !parsed.gaps.length)
    throw new Error('API analysis must contain operations, questions or gaps');
  return {
    selection: {
      operations: selected,
      gaps: parsed.gaps.map((gap) => ({
        kind: 'missing_operation',
        description: gap.description,
      })),
    },
    questions,
  };
}
