import { z } from 'zod';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';

/** Only declared presentation fields use this schema; executable values never do. */
export const optionalPlanningExplanationSchema = z
  .unknown()
  .transform((value) => {
    const result = planningEvidenceTextSchema.safeParse(value);
    return result.success ? result.data : undefined;
  })
  .optional();

const planningExplanationObjectSchema = z.strictObject({
  reason: planningEvidenceTextSchema,
});

export const optionalPlanningExplanationObjectSchema = z
  .unknown()
  .transform((value) => {
    const result = planningExplanationObjectSchema.safeParse(value);
    return result.success ? result.data : undefined;
  })
  .optional();
