import { z } from 'zod';

const outcomeIdentity = z.object({
  draftId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  changeStatus: z.enum(['changed', 'no-change']),
});

/** Host-owned facts after adoption; never model-supplied completion or execution claims. */
export const draftConversationOutcomeSchema = z.discriminatedUnion('kind', [
  outcomeIdentity
    .extend({
      kind: z.literal('workflow-exported'),
      triggerConnected: z.boolean(),
      runtimeInputsReady: z.boolean(),
      deploymentConfigured: z.boolean(),
      unresolvedGapNodeIds: z.array(z.string().min(1)).optional(),
    })
    .strict(),
  outcomeIdentity
    .extend({
      kind: z.literal('no-workflow'),
      reason: z.literal('no-api-or-native-instances'),
      unresolvedRequirementIds: z.array(z.string().min(1)),
    })
    .strict(),
]);
