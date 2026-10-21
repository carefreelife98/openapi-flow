import { z } from 'zod';

/** Transport shape only. The contextual factory owns current-target and OAS checks. */
export const workflowDraftApiInputEditAnswerSchema = z.strictObject({
  targetId: z.string().min(1),
  value: z.json(),
});

export const workflowDraftApiInputEditAnswersSchema = z.strictObject({
  contractId: z.string().min(1),
  answers: z.array(workflowDraftApiInputEditAnswerSchema),
});
