import { z } from 'zod';
import { resolveApiOperationChoiceAnswer } from '@openapi-flow/core';
import type { ApiSelectionQuestion } from '@openapi-flow/core';

export const inputAnswersResponseSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('answer'),
    answers: z
      .array(
        z.strictObject({ requirementId: z.string().min(1), value: z.json() }),
      )
      .min(1),
  }),
  z.strictObject({ action: z.literal('reply'), text: z.string().min(1) }),
  z.strictObject({ action: z.literal('cancel') }),
]);

export function createOperationChoiceResponseSchema(
  questions: ApiSelectionQuestion[],
) {
  const alternatives = questions.map((question) => {
    const offered = question.candidates.map((candidate) =>
      z.strictObject({
        documentId: z.literal(candidate.key.documentId),
        snapshotId: z.literal(candidate.key.snapshotId),
        operationRef: z.literal(candidate.key.operationRef),
      }),
    );
    if (!offered.length)
      throw new Error('operation choice requires offered candidates');
    const operation = offered.length === 1 ? offered[0] : z.union(offered);
    return question.kind === 'operation-choice'
      ? z.strictObject({ questionId: z.literal(question.id), operation })
      : z.strictObject({
          questionId: z.literal(question.id),
          operations: z
            .array(operation)
            .min(question.minSelections)
            .max(question.maxSelections),
        });
  });
  if (!alternatives.length)
    throw new Error('operation choice response requires offered candidates');
  const answer =
    alternatives.length === 1 ? alternatives[0] : z.union(alternatives);
  return z.discriminatedUnion('action', [
    z.strictObject({
      action: z.literal('choose'),
      answers: z
        .array(answer)
        .min(1)
        .superRefine((answers, context) => {
          const ids = answers.map((item) => item.questionId);
          if (new Set(ids).size !== ids.length)
            context.addIssue({
              code: 'custom',
              message: 'Answer each operation question at most once',
            });
          for (const answer of answers) {
            const question = questions.find(
              (entry) => entry.id === answer.questionId,
            );
            if (!question)
              throw new Error('Operation answer has no source question');
            try {
              resolveApiOperationChoiceAnswer({ question, answer });
            } catch (error) {
              context.addIssue({
                code: 'custom',
                message:
                  error instanceof Error
                    ? error.message
                    : 'Invalid operation choice',
              });
            }
          }
        }),
    }),
    z.strictObject({ action: z.literal('cancel') }),
  ]);
}
