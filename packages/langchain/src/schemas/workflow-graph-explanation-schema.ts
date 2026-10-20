import { z } from 'zod';

export const workflowGraphExplanationOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().optional(),
});

export const workflowGraphReasonSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0)
  .describe(
    'Brief user-facing reason in the scenario language for this graph strategy, NEW native instance, edge or newly blocked call. Use only the scenario, supplied API roles/contracts, prepared instances and offered native schemas. Explain no new native nodes or independent roots in the overall reason. Code preserves source evidence and derives ports, starts and validation. Do not generate source copies, evidence, quotes or private chain-of-thought.',
  );
