import { z } from 'zod';
import type { WorkflowApiValuePlan } from '../types/workflow-api-values.js';

export const workflowApiValueCallPlanSchema = z.strictObject({
  values: z.record(z.string(), z.json()),
  requestedInputs: z.array(z.string()),
});
export const workflowApiValuePlanSchema = z.strictObject({
  sourceFingerprint: z.string().min(1),
  calls: z.record(z.string().min(1), workflowApiValueCallPlanSchema),
}) satisfies z.ZodType<WorkflowApiValuePlan>;
