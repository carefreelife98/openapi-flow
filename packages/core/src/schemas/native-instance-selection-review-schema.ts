import { z } from 'zod';
import type {
  NativeInstanceGapAssessment,
  NativeInstanceSelectionReviewDescription,
  NativeInstanceSelectionReviewProposal,
} from '../types/native-instance-selection-review.js';

/** Only a real supplied reference may explain which separate stage owns a reported issue. */
export function createNativeInstanceSelectionReviewSchema(
  description: NativeInstanceSelectionReviewDescription,
): z.ZodType<NativeInstanceSelectionReviewProposal> {
  const evidence = {
    sourceQuote: z
      .string()
      .regex(/\S/u)
      .describe(
        'Exact unchanged quote from context.scenario supporting this assessment.',
      ),
    reason: z
      .string()
      .regex(/\S/u)
      .describe(
        'Short evidence-based routing reason, not private reasoning or a claim of execution success.',
      ),
  };
  const choices: z.ZodType<NativeInstanceGapAssessment>[] = [
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
  return z.strictObject({
    assessments: z.strictObject(
      Object.fromEntries(
        description.gaps.map((gap) => [gap.id, z.union(choices)]),
      ),
    ),
  }) as z.ZodType<NativeInstanceSelectionReviewProposal>;
}
