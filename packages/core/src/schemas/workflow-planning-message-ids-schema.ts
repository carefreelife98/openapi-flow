import { z } from 'zod';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';

export const workflowPlanningMessageIdsSchema = z
  .array(planningEvidenceTextSchema)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'planningMessageIds must contain distinct actual message IDs',
  );
