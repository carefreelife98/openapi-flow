import { createHash } from 'node:crypto';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type {
  ApiSelectionAnalysis,
  ApiSelectionQuestion,
} from '@openapi-flow/core';
import {
  describeApiSelectionContext,
  createApiSelectionExplanation,
  validateApiSelectionQuestion,
} from '@openapi-flow/core';
import type { SelectApiOperationsInput } from '../types/operation-selection.js';
import type { ApiSelectionAnalysisOutput } from '../types/api-selection-analysis.js';
import { createApiSelectionAnalysisSchema } from '../schemas/api-selection-analysis-schema.js';
import { apiSelectionAnalysisPrompt } from '../prompts/api-selection-analysis-prompt.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { selectApiOperations } from './select-api-operations.js';
import { resolveApiSelectionOptions } from './resolve-api-selection-options.js';
import { apiSelectionExplanationPrompt } from '../prompts/api-selection-explanation-prompt.js';

/** Additive clarification boundary; the existing selector keeps its output contract. */
export async function analyzeApiSelection(
  input: SelectApiOperationsInput,
): Promise<ApiSelectionAnalysis> {
  assertSelectionInput(input.scenario, input.model);
  if (!Array.isArray(input.operations))
    throw new Error('operations must be an array');
  const includeExplanations = resolveApiSelectionOptions({
    includeExplanations: input.includeExplanations,
  });
  const context = describeApiSelectionContext({
    scenario: input.scenario,
    operations: input.operations,
  });
  if (!input.operations.length)
    return { selection: await selectApiOperations(input), questions: [] };
  const candidates = context.operations.map((operation, index) => ({
    ...operation,
    candidateId: `candidate-${index + 1}`,
  }));
  const schema = createApiSelectionAnalysisSchema(
    candidates.map((item) => item.candidateId),
    includeExplanations,
  );
  const proposed = await input.model
    .withStructuredOutput<ApiSelectionAnalysisOutput>(schema, {
      name: 'analyze_api_selection',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(
        `${apiSelectionAnalysisPrompt}\n${apiSelectionExplanationPrompt}`,
      ),
      new HumanMessage(
        JSON.stringify({ scenario: context.scenario, candidates }),
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
    return {
      key: structuredClone(candidate.key),
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
  });
  const questions = parsed.questions.map<ApiSelectionQuestion>(
    (question, index) => {
      if (new Set(question.candidateIds).size !== question.candidateIds.length)
        throw new Error('API alternatives must be distinct');
      const alternatives = question.candidateIds.map((id) => {
        const candidate = byId.get(id);
        if (!candidate) throw new Error(`Unknown API alternative ${id}`);
        return structuredClone(
          context.operations[candidates.indexOf(candidate)],
        );
      });
      const common = {
        id: createHash('sha256')
          .update(
            JSON.stringify([
              context.scenario,
              index,
              question.purpose,
              alternatives.map((item) => item.key),
              ...(question.kind === 'multiple-choice'
                ? [
                    'multiple-choice',
                    question.minSelections,
                    question.maxSelections,
                  ]
                : []),
            ]),
          )
          .digest('hex'),
        message: question.message,
        purpose: question.purpose,
        candidates: alternatives,
        ...('explanation' in question
          ? {
              explanation: createApiSelectionExplanation({
                context,
                basis: {
                  kind: 'candidates',
                  operations: alternatives.map((candidate) => candidate.key),
                },
                reason: question.explanation.reason,
              }),
            }
          : {}),
      };
      const result: ApiSelectionQuestion =
        question.kind === 'single-choice'
          ? { ...common, kind: 'operation-choice' }
          : {
              ...common,
              kind: 'operation-multiple-choice',
              minSelections: question.minSelections,
              maxSelections: question.maxSelections,
            };
      validateApiSelectionQuestion(result);
      return result;
    },
  );
  if (!selected.length && !questions.length && !parsed.gaps.length)
    throw new Error('API analysis must contain operations, questions or gaps');
  return {
    selection: {
      operations: selected,
      gaps: parsed.gaps.map((gap) => ({
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
    },
    questions,
  };
}
