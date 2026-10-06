import { z } from 'zod';
import type {
  ReviewableWorkflowGraphProposal,
  WorkflowCapability,
} from '@openapi-flow/core';

export function createReviewableWorkflowGraphSchema(
  capabilities: WorkflowCapability[],
  readyCallIds: string[],
): z.ZodType<ReviewableWorkflowGraphProposal> {
  const natives = capabilities.map((capability) =>
    z.strictObject({
      id: z
        .string()
        .min(1)
        .describe(
          'Unique native node ID, distinct from API callIds and all gap IDs.',
        ),
      capability: z.literal(capability.name).describe(capability.description),
      parameters: capability.parametersSchema,
    }),
  );
  return z.strictObject({
    nativeNodes:
      natives.length === 0
        ? z.tuple([])
        : z
            .array(z.union([natives[0], ...natives.slice(1)]))
            .describe(
              'Only implementable native functions, with typed parameters. Never refer to an unavailable response.',
            ),
    edges: z
      .array(
        z.strictObject({
          from: z
            .string()
            .min(1)
            .describe(
              'Exact API callId, native ID, supplied gap ID or additional gap ID.',
            ),
          output: z
            .string()
            .min(1)
            .describe(
              'Declared source port. API and gap placeholders expose main.',
            ),
          to: z.string().min(1).describe('Exact target node ID.'),
          input: z
            .string()
            .min(1)
            .describe(
              'Declared target port. API and gap placeholders accept main.',
            ),
        }),
      )
      .describe(
        'Scenario-grounded internal DAG, including unresolved steps. Array order is never execution order.',
      ),
    additionalGaps: z.array(
      z.strictObject({
        id: z
          .string()
          .min(1)
          .describe(
            'Unique graph gap node ID, referenced directly by edges. Never duplicate a supplied gap.',
          ),
        description: z
          .string()
          .min(1)
          .describe(
            'Explicit unmet scenario requirement and why supplied materials/capabilities cannot implement it.',
          ),
      }),
    ),
    blockedCalls:
      readyCallIds.length === 0
        ? z.tuple([])
        : z.array(
            z.strictObject({
              callId: z
                .enum(readyCallIds)
                .describe(
                  'A supplied ready call that must instead be a failing placeholder because a scenario dependency remains unresolved. Do not repeat already blocked calls.',
                ),
              gapIds: z
                .array(z.string().min(1))
                .min(1)
                .describe(
                  'IDs of supplied or additional gaps that prevent this API call. Never fabricate a response binding.',
                ),
            }),
          ),
  });
}
