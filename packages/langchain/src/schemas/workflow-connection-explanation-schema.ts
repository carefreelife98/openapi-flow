import { z } from 'zod';

export const workflowConnectionExplanationOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().optional(),
});

export const workflowConnectionReasonSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0)
  .describe(
    'Brief user-facing reason in the scenario language for this graph strategy, new edge or newly blocked call. Use only supplied roles, immutable node parameters, actual ports, declared dependencies and gaps. Explain no-new-edge/independent-root decisions in the top-level reason. Code retains original source contracts and derives starts and verification. Never generate evidence, quoted source copies or private chain-of-thought.',
  );
