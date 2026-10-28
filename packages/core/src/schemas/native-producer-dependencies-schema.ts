import { z } from 'zod';
import type { NativeProducerDependencySchemaInput } from '../types/native-producer-dependencies.js';
import type { NativeInstanceDependencyProposal } from '../types/native-instance-dependencies.js';
import { optionalPlanningExplanationSchema } from './optional-planning-explanation-schema.js';

/** Code supplies identities; model output selects allowed producer materials and optional reasons. */
export function createNativeProducerDependenciesSchema(
  input: NativeProducerDependencySchemaInput,
  requireExplanations = true,
): z.ZodType<NativeInstanceDependencyProposal> {
  const schema = z.strictObject({
    sourcesByNodeId: z.strictObject(
      Object.fromEntries(
        input.targets.map((target) => [
          target.nodeId,
          z
            .strictObject({
              sourceNodeIds: (target.sourceNodeIds.length
                ? z.array(z.enum(target.sourceNodeIds))
                : z.array(z.string()).max(0)
              )
                .refine(
                  (sources) => new Set(sources).size === sources.length,
                  'Native producer IDs must be distinct',
                )
                .describe(
                  'Selected producer materials this instance may reference. Final settings may use a subset; actual references are derived from those settings. Empty means no producer access. Not execution edges or scheduling preferences. Future roles do not yet have output schemas.',
                ),
              ...(!requireExplanations
                ? { reason: optionalPlanningExplanationSchema }
                : input.includeExplanations && target.sourceNodeIds.length
                  ? {
                      reason: z
                        .string()
                        .min(1)
                        .describe(
                          'Short reason grounded in the supplied request and original role/source contracts.',
                        ),
                    }
                  : {}),
            })
            .describe(target.description),
        ]),
      ),
    ),
  }) as z.ZodType<NativeInstanceDependencyProposal>;
  if (requireExplanations) return schema;
  return schema.transform((proposal) => ({
    sourcesByNodeId: Object.fromEntries(
      Object.entries(proposal.sourcesByNodeId).map(([id, source]) => {
        const choice = { ...source };
        if (!input.includeExplanations || choice.reason === undefined)
          delete choice.reason;
        return [id, choice];
      }),
    ),
  }));
}
