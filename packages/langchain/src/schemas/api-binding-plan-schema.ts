import { z } from 'zod';
import type {
  ApiBindingMaterial,
  NativeOutputContract,
} from '@openapi-flow/core';
import type { ApiBindingPlanOutput } from '../types/binding-planning.js';

export const apiBindingPlanningOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().optional(),
});

export const apiBindingCallReasonSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0)
  .describe(
    "Brief user-facing reason in the scenario language for this call's selected data bindings or decision that no binding is requested. Acknowledge any declared binding gaps for this call. This is not a value-generation, status-expectation or control-flow decision. Code attaches the exact supplied scenario, roles, OAS and native source contracts. Do not generate evidence, quotes, schemas or private chain-of-thought.",
  );

export function createApiBindingPlanSchema(
  materials: ApiBindingMaterial[],
  nativeOutputs: NativeOutputContract[] = [],
  includeExplanations = false,
): z.ZodType<ApiBindingPlanOutput> {
  z.boolean().parse(includeExplanations);
  if (!materials.length) throw new Error('binding materials must not be empty');
  const ids = materials.map((item) => item.callId);
  const sourceIds = [...ids, ...nativeOutputs.map((item) => item.nodeId)];
  if (
    new Set(sourceIds).size !== sourceIds.length ||
    sourceIds.some((id) => !id.trim())
  )
    throw new Error('binding sources require unique non-empty node IDs');
  if (new Set(ids).size !== ids.length || ids.some((id) => !id.trim()))
    throw new Error('binding materials require unique non-empty callIds');
  return z.strictObject({
    calls: z.array(
      z.strictObject({
        ...(includeExplanations ? { reason: apiBindingCallReasonSchema } : {}),
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
                .enum(sourceIds)
                .describe(
                  'Declared API or native node producing the actual value, not merely the previous array element.',
                ),
              sourcePointer: z
                .string()
                .describe(
                  'RFC 6901 pointer into an API response BODY or a declared native JSON output. Empty string means the entire value. Use exact schema-declared responsePointerCatalog paths where applicable, without transport-envelope prefixes. Dynamic paths require scenario and contract evidence; the catalog is not a whitelist or a runtime existence guarantee.',
                ),
            }),
          )
          .describe(
            'Only scenario-requested response-to-request dependencies. Return [] when no dependency is requested. Independent literals, supplied or missing, are handled by the later argument-generation stage and are not binding gaps.',
          ),
      }),
    ),
    gaps: z
      .array(
        z.strictObject({
          callId: z
            .enum(ids)
            .describe(
              'Exact selected API whose explicitly requested data dependency cannot be represented. An independent literal input does not make this call blocked.',
            ),
          targetPointer: z
            .string()
            .min(1)
            .describe(
              'RFC 6901 pointer to the affected request input declared by this API OAS.',
            ),
          description: z
            .string()
            .min(1)
            .describe(
              'Explain the requested dependency and why its producer, source contract or required transformation prevents a binding. Never describe a successful no-binding decision or a missing independent literal here.',
            ),
        }),
      )
      .describe(
        'Blocking failures of explicitly requested response-to-request dependencies only. Return [] if there are no such failures, including when all inputs are independent literals. Not informational notes, missing independent literals, missing API capabilities, control flow or response assertions. Those belong to other planning stages. Do not invent values or APIs.',
      ),
  });
}
