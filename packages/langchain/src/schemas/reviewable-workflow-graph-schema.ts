import { z } from 'zod';
import type { WorkflowCapability } from '@openapi-flow/core';
import type { WorkflowGraphExplanationMode } from '../types/workflow-planning.js';
import { workflowConnectionReasonSchema } from './workflow-connection-explanation-schema.js';
import { workflowGraphReasonSchema } from './workflow-graph-explanation-schema.js';

export function createReviewableWorkflowGraphSchema(
  capabilities: WorkflowCapability[],
  readyCallIds: string[],
  explanationMode: WorkflowGraphExplanationMode = 'none',
) {
  const includeExplanations = explanationMode !== 'none';
  const reasonSchema =
    explanationMode === 'graph'
      ? workflowGraphReasonSchema
      : workflowConnectionReasonSchema;
  const natives = capabilities.map((capability) =>
    z.strictObject({
      ...(explanationMode === 'graph'
        ? { reason: workflowGraphReasonSchema }
        : {}),
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
  const additionalNativeNodes =
    natives.length === 0
      ? undefined
      : z
          .array(z.union([natives[0], ...natives.slice(1)]))
          .describe(
            'NEW native nodes only, with typed parameters. Existing preparedNativeNodes and API materials are already present. Never repeat their IDs or parameters. Return [] when no new native node is needed. Never refer to an unavailable response.',
          );
  const blockedCalls =
    readyCallIds.length === 0
      ? undefined
      : z.array(
          z.strictObject({
            ...(includeExplanations ? { reason: reasonSchema } : {}),
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
        );
  const base = z.strictObject({
    ...(includeExplanations ? { reason: reasonSchema } : {}),
    edges: z
      .array(
        z.strictObject({
          ...(includeExplanations ? { reason: reasonSchema } : {}),
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
  });
  if (additionalNativeNodes && blockedCalls)
    return base.extend({ additionalNativeNodes, blockedCalls });
  if (additionalNativeNodes) return base.extend({ additionalNativeNodes });
  if (blockedCalls) return base.extend({ blockedCalls });
  return base;
}
