import assert from 'node:assert/strict';
import {
  describeWorkflowDraftApiInputEditAnswerRequirements,
  describeApiInputEnumAnswerChoices,
  describeApiInputSources,
  resolveApiInputSourceSelections,
  resolveApiInputAnswerInterpretations,
  resolveWorkflowDraftApiInputEditReply,
  resolveWorkflowDraftApiInputEdits,
  validateApiInputAnswerAnalysis,
} from '@openapi-flow/core';
import type {
  ResolveWorkflowDraftApiInputEditsInput,
  ApiInputAnswerAnalysis,
  ApiInputAnswerSourceSelection,
  JsonValue,
} from '@openapi-flow/core';
import { analyzeApiInputAnswers } from '@openapi-flow/langchain';
import type { AnalyzeApiInputAnswersInput } from '@openapi-flow/langchain';

/** Compile the actual installed public model signature without a remote call. */
export function analyzeConsumerApiInputReply(
  input: AnalyzeApiInputAnswersInput,
): Promise<ApiInputAnswerAnalysis> {
  return analyzeApiInputAnswers({ ...input, selectOasEnums: true });
}

/** The request contract and explicit answer come from the consumer's actual OAS fixture. */
export function verifyConsumerApiEditReply(
  input: ResolveWorkflowDraftApiInputEditsInput,
  value: JsonValue,
): void {
  const requirements =
    describeWorkflowDraftApiInputEditAnswerRequirements(input);
  assert.equal(requirements.length, 1);
  const reply = JSON.stringify(value);
  const context = { requirements, reply, selectOasEnums: true };
  assert(Array.isArray(describeApiInputEnumAnswerChoices(context)));
  const source = describeApiInputSources(reply).json.find(
    (candidate) => candidate.text === reply,
  );
  assert(source, 'A complete original JSON value is required');
  const selections: ApiInputAnswerSourceSelection[] = [
    {
      requirementId: requirements[0]!.id,
      source: { kind: 'json', candidateId: source.id },
    },
  ];
  const analysis: ApiInputAnswerAnalysis = {
    status: 'extracted',
    ...resolveApiInputAnswerInterpretations({
      ...context,
      selections: resolveApiInputSourceSelections({ ...context, selections }),
    }),
  };
  validateApiInputAnswerAnalysis({ ...context, analysis });
  const answers = resolveWorkflowDraftApiInputEditReply({
    ...input,
    reply,
    analysis,
    selectOasEnums: true,
  });
  assert.deepEqual(answers.answers[0]!.value, value);
  const result = resolveWorkflowDraftApiInputEdits({
    ...input,
    confirmedAnswers: answers,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.values, input.output);
}
