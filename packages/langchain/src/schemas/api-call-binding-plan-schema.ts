import { z } from 'zod';
import {
  createApiRequestInputPointerSchema,
  optionalPlanningExplanationSchema,
} from '@openapi-flow/core';
import type {
  ApiCallBindingProposal,
  ApiCallBindingPlanningDescription,
} from '@openapi-flow/core';
import { apiBindingCallReasonSchema } from './api-binding-plan-schema.js';

export const apiBindingCallExecutionSchema = z.object({
  concurrency: z.number().int().positive(),
});

function callGapsSchema(description: ApiCallBindingPlanningDescription) {
  return z.array(
    z.strictObject({
      targetPointer: createApiRequestInputPointerSchema(
        description.requestSchema,
      ),
      description: z
        .string()
        .min(1)
        .describe(
          'Only an explicitly requested data dependency that cannot be represented. Missing independent literal inputs belong to argument generation, not this gap.',
        ),
    }),
  );
}

export function createApiBindingSourceDecisionSchema(
  description: ApiCallBindingPlanningDescription,
  requireExplanations = true,
) {
  const ids = description.sourceCandidates.map((candidate) => candidate.nodeId);
  const independent = z.strictObject({
    kind: z
      .literal('independent-inputs')
      .describe(
        'No upstream response value is requested for this target. Required or missing independent request values are handled later; they are not missing producers.',
      ),
  });
  const missing = z.strictObject({
    kind: z.literal('missing-response-sources'),
    gaps: callGapsSchema(description)
      .min(1)
      .describe(
        'Only explicit response-to-request dependencies with no supplied producer. Never use this decision for absent independent runtime values.',
      ),
  });
  const available = ids.length
    ? [
        z.strictObject({
          kind: z.literal('selected-response-sources'),
          sourceNodeIds: z
            .array(z.enum(ids))
            .min(1)
            .describe(
              'All plausible provided producers requested for this target, independent of inventory order. Code retrieves their original contracts.',
            ),
        }),
        z.strictObject({
          kind: z.literal('partially-missing-response-sources'),
          sourceNodeIds: z.array(z.enum(ids)).min(1),
          gaps: callGapsSchema(description).min(1),
        }),
      ]
    : [];
  const schema = z.strictObject({
    // Distinct literal kinds keep these branches exclusive; union emits strict-provider-compatible anyOf.
    decision: z.union([independent, missing, ...available]),
  });
  if (!requireExplanations)
    return schema.extend({ reason: optionalPlanningExplanationSchema });
  return description.input.includeExplanations === true
    ? schema.extend({ reason: apiBindingCallReasonSchema })
    : schema;
}

export function createApiCallBindingPlanSchema(
  description: ApiCallBindingPlanningDescription,
  sourceNodeIds: string[],
  requireExplanations = true,
): z.ZodType<ApiCallBindingProposal> {
  if (!sourceNodeIds.length)
    throw new Error('field planning requires selected source contracts');
  const schema = z.strictObject({
    bindings: z.array(
      z.strictObject({
        targetPointer: createApiRequestInputPointerSchema(
          description.requestSchema,
        ),
        sourceNodeId: z
          .enum(sourceNodeIds)
          .describe(
            'Exact identity of a retrieved producer, never an inferred predecessor.',
          ),
        sourcePointer: z
          .string()
          .describe(
            'RFC 6901 pointer into the unchanged API response BODY or native JSON output. Empty string reads the entire value. Never an expression, cast or invented value.',
          ),
      }),
    ),
    gaps: callGapsSchema(description),
  });
  if (!requireExplanations)
    return schema.extend({ reason: optionalPlanningExplanationSchema });
  return description.input.includeExplanations === true
    ? schema.extend({ reason: apiBindingCallReasonSchema })
    : schema;
}
