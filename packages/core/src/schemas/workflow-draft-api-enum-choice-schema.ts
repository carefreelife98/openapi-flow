import { z } from 'zod';
import type { WorkflowDraftApiEnumSelection } from '../types/workflow-draft-api-enum-selection.js';
import type { ApiInputEnumCandidate } from '../types/api-input-enum.js';
import { optionalPlanningExplanationSchema } from './optional-planning-explanation-schema.js';

/** No generated value or schema field exists in a semantic enum choice. */
export function createWorkflowDraftApiEnumChoiceSchema(
  candidates: ApiInputEnumCandidate[],
  messageIds: string[],
  requireExplanations = true,
): z.ZodType<WorkflowDraftApiEnumSelection> {
  if (!messageIds.length)
    throw new Error('API enum choice requires original human message IDs');
  if (!candidates.length) return z.never();
  return z.strictObject({
    candidateId: z
      .enum(candidates.map((candidate) => candidate.id))
      .describe(
        'Choose an offered original-OAS enum candidate ID. Code copies its original value; never generate a request value.',
      ),
    messageId: z
      .enum(messageIds)
      .describe(
        'Actual supplied human message expressing this enum intent, not an OAS quotation.',
      ),
    sourceText: z
      .string()
      .min(1)
      .describe(
        'Exact original human text expressing the intended meaning; it need not contain the enum literal.',
      ),
    reason: requireExplanations
      ? z
          .string()
          .min(1)
          .refine((value) => value.trim().length > 0)
          .describe(
            'Brief user-facing reason why this OAS choice matches the cited request. Not private chain-of-thought.',
          )
      : optionalPlanningExplanationSchema,
  });
}
