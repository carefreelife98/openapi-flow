import { z } from 'zod';
import type { ApiBindingMaterial, ApiBindingPlan } from '@openapi-flow/core';

export function createApiBindingPlanSchema(
  materials: ApiBindingMaterial[],
): z.ZodType<ApiBindingPlan> {
  if (!materials.length) throw new Error('binding materials must not be empty');
  const ids = materials.map((item) => item.callId);
  if (new Set(ids).size !== ids.length || ids.some((id) => !id.trim()))
    throw new Error('binding materials require unique non-empty callIds');
  return z.strictObject({
    calls: z.array(
      z.strictObject({
        callId: z
          .enum(ids)
          .describe(
            'Exact API call identity. Include each call once, including calls without bindings.',
          ),
        bindings: z
          .array(
            z.strictObject({
              kind: z.literal('node-output'),
              targetPointer: z
                .string()
                .min(1)
                .describe(
                  'RFC 6901 request pointer: /path/id, /query/name, /body or a nested body field. Never a JavaScript expression.',
                ),
              sourceNodeId: z
                .enum(ids)
                .describe(
                  'API producing the actual response value, not merely the previous array element.',
                ),
              sourcePointer: z
                .string()
                .describe(
                  'RFC 6901 pointer into the response BODY, derived from its OAS schema. Empty string means the entire body.',
                ),
            }),
          )
          .describe(
            'Only scenario-requested response-to-request dependencies. Empty for independently supplied literal inputs.',
          ),
      }),
    ),
    gaps: z
      .array(z.strictObject({ description: z.string().min(1) }))
      .describe(
        'Only API request-input requirements that need unavailable data or transformations. Control flow and response assertions belong to the later graph planner, not these gaps. Do not invent values or APIs.',
      ),
  });
}
