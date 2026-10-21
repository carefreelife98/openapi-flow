import assert from 'node:assert/strict';
import {
  resolveApiOperationChoiceAnswer,
  resolveApiSelectionAnswers,
  validateApiSelectionQuestion,
} from '@openapi-flow/core';
import type {
  ApiCatalog,
  ApiSelectionQuestion,
  ApiSelectionAnswer,
} from '@openapi-flow/core';

export async function verifyConsumerApiChoices(catalog: ApiCatalog) {
  const candidates = catalog.operations.slice(0, 2);
  assert.equal(candidates.length, 2, 'Consumer OAS needs two API candidates');
  const question: ApiSelectionQuestion = {
    kind: 'operation-multiple-choice',
    id: 'consumer-explicit-subset',
    message: 'Choose both offered sources.',
    purpose: 'Consumer selection contract',
    candidates,
    minSelections: 2,
    maxSelections: 2,
  };
  const answer: ApiSelectionAnswer = {
    questionId: question.id,
    operations: candidates.map((candidate) => candidate.key),
  };
  validateApiSelectionQuestion(question);
  assert.equal(resolveApiOperationChoiceAnswer({ question, answer }).length, 2);
  const result = await resolveApiSelectionAnswers({
    catalog,
    analysis: {
      selection: { operations: [], gaps: [] },
      questions: [question],
    },
    answers: [answer],
  });
  assert.equal(result.selection.operations.length, 2);
  assert.equal(result.questions.length, 0);
  assert.throws(() =>
    resolveApiOperationChoiceAnswer({
      question,
      answer: { questionId: question.id, operation: candidates[0]!.key },
    }),
  );
}
