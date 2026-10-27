import { z } from 'zod';
import type {
  NativeInstanceGapAssessmentProposal,
  NativeInstanceSelectionReviewDescription,
  NativeInstanceSelectionReviewProposal,
} from '../types/native-instance-selection-review.js';

export const nativeInstanceSelectionReviewOptionsSchema = z.strictObject({
  reviewInstances: z.literal(true).optional(),
});

/** Only a real supplied reference may explain which separate stage owns a reported issue. */
export function createNativeInstanceSelectionReviewSchema(
  description: NativeInstanceSelectionReviewDescription,
  requireExplanations = true,
): z.ZodType<NativeInstanceSelectionReviewProposal> {
  nativeInstanceSelectionReviewOptionsSchema.parse({
    reviewInstances: description.reviewInstances,
  });
  const evidence = {
    reason: requireExplanations
      ? z
          .string()
          .regex(/\S/u)
          .describe(
            'Short user-facing explanation, not private reasoning or a claim of execution success.',
          )
      : z.unknown().optional(),
  };
  const choices: z.ZodType<NativeInstanceGapAssessmentProposal>[] = [
    z.strictObject({
      kind: z
        .literal('not-required')
        .describe(
          'The reported gap concerns behavior not requested, explicitly excluded, or only optional future work in the original scenario. This requests a fresh selection; it does not delete a gap, approve support, or alter the original request.',
        ),
      ...evidence,
    }),
    z.strictObject({
      kind: z.literal('unsupported-native-behavior'),
      ...evidence,
    }),
    z.strictObject({
      kind: z.literal('business-decision'),
      question: z.string().regex(/\S/u),
      ...evidence,
    }),
  ];
  if (description.context.capabilities.length)
    choices.push(
      z.strictObject({
        kind: z.literal('native-configuration'),
        capability: z.enum(
          description.context.capabilities.map((entry) => entry.name),
        ),
        ...evidence,
      }),
    );
  const callIds = description.context.apiMaterials.map((entry) => entry.callId);
  if (callIds.length)
    choices.push(
      z.strictObject({
        kind: z.literal('api-planning'),
        callIds: z.array(z.enum(callIds)).min(1),
        ...evidence,
      }),
    );
  const nodeIds = [
    ...callIds,
    ...description.context.preparedNativeNodes.map((entry) => entry.id),
    ...description.instances.map((entry) => entry.id),
  ];
  if (nodeIds.length)
    choices.push(
      z.strictObject({
        kind: z.literal('connection-planning'),
        nodeIds: z.array(z.enum(nodeIds)).min(1),
        ...evidence,
      }),
    );
  const properties = {
    assessments: z.strictObject(
      Object.fromEntries(
        description.gaps.map((gap) => [gap.id, z.union(choices)]),
      ),
    ),
  };
  if (description.reviewInstances !== true)
    return z.strictObject(
      properties,
    ) as z.ZodType<NativeInstanceSelectionReviewProposal>;
  const role = z
    .union([
      z.strictObject({ kind: z.literal('required'), ...evidence }),
      z.strictObject({ kind: z.literal('not-required'), ...evidence }),
      z.strictObject({
        kind: z.literal('business-decision'),
        question: z.string().regex(/\S/u),
        ...evidence,
      }),
    ])
    .describe(
      'Whether this exact selected role is required to implement the original request. Optional future possibilities are not current requirements. Review every supplied instance ID without adding or removing an instance.',
    );
  return z.strictObject({
    ...properties,
    coverageAssessment: z
      .union([
        z.strictObject({ kind: z.literal('covered'), ...evidence }),
        z.strictObject({ kind: z.literal('needs-reselection'), ...evidence }),
        z.strictObject({
          kind: z.literal('unsupported-native-behavior'),
          ...evidence,
        }),
        z.strictObject({
          kind: z.literal('business-decision'),
          question: z.string().regex(/\S/u),
          ...evidence,
        }),
      ])
      .describe(
        "Does the entire supplied native selection cover the original request's required native processing? Check missing processing even when no roles or gaps were reported. API bindings, request values and later connection planning are separate responsibilities. An available native implementation omitted by the proposal needs reselection, not an unsupported claim.",
      ),
    instanceAssessments: z.strictObject(
      Object.fromEntries(
        description.instances.map((instance) => [instance.id, role]),
      ),
    ),
  }) as z.ZodType<NativeInstanceSelectionReviewProposal>;
}
