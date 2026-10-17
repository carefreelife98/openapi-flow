import { z } from 'zod';
import type { ApiOperationChoice } from '@openapi-flow/core';

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
  questions: ApiOperationChoice[],
) {
  const alternatives = questions.flatMap((question) =>
    question.candidates.map((candidate) =>
      z.strictObject({
        questionId: z.literal(question.id),
        operation: z.strictObject({
          documentId: z.literal(candidate.key.documentId),
          snapshotId: z.literal(candidate.key.snapshotId),
          operationRef: z.literal(candidate.key.operationRef),
        }),
      }),
    ),
  );
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
        }),
    }),
    z.strictObject({ action: z.literal('cancel') }),
  ]);
}
