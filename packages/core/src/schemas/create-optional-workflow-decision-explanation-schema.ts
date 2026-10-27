import { z } from 'zod';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';
import { isObject } from '../utils/is-object.js';

/** Presentation may be omitted; supplied references are validated before any omission. */
export function createOptionalWorkflowDecisionExplanationSchema<Evidence>(
  evidenceSchema: z.ZodType<Evidence>,
) {
  const fields = z.object({
    reason: z.unknown().optional(),
    evidence: z
      .array(evidenceSchema)
      .refine(
        (items) =>
          new Set(items.map((item) => JSON.stringify(item))).size ===
          items.length,
        'Planning evidence must not repeat an identical source',
      )
      .optional(),
  });
  return z.preprocess(
    (value) => (isObject(value) ? value : undefined),
    fields.optional().transform((value) => {
      if (value === undefined) return undefined;
      const reason = planningEvidenceTextSchema.safeParse(value.reason);
      if (!reason.success || !value.evidence?.length) return undefined;
      return { reason: reason.data, evidence: value.evidence };
    }),
  );
}
