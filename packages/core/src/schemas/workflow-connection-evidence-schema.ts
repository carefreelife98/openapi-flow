import { z } from 'zod';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';

export const workflowConnectionEvidenceReferenceSchema = z.strictObject({
  evidenceId: planningEvidenceTextSchema,
  pointer: z.string().regex(/^(?:\/(?:[^~]|~[01])*)?$/u),
  quote: planningEvidenceTextSchema.optional(),
});
