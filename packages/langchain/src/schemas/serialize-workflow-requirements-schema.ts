import type { z } from 'zod';
import type { WorkflowRequirementsModelOutput } from '../types/workflow-clarification.js';
import { serializeStructuredOutputSchema } from './serialize-structured-output-schema.js';

/** Own wire serialization; retain descriptions and avoid framework ref/title rewrites. */
export function serializeWorkflowRequirementsSchema(
  schema: z.ZodType<WorkflowRequirementsModelOutput>,
) {
  return serializeStructuredOutputSchema(schema, 'draft-7', 'input', 'ref');
}
