import { z } from 'zod';

export const nativeNodeExplanationOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().optional(),
});
export const nativeNodePlanningReasonSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0)
  .describe(
    'Brief user-facing reason in the scenario language for this proposed native instance and its requested parameter values, or for adding no new instance. Explain the proposal, not private chain-of-thought. Code attaches the actual supplied scenario, API roles, prepared nodes and capability schemas. Never generate evidence, ports, output schemas, source quotes, slot IDs or n8n JSON.',
  );
