import { z } from 'zod';
import type { NativeProducerDependencySchemaInput } from '../types/native-producer-dependencies.js';
import type { NativeInstanceDependencyProposal } from '../types/native-instance-dependencies.js';

/** Code supplies identities; model output contains only exact producer choices and optional reasons. */
export function createNativeProducerDependenciesSchema(
  input: NativeProducerDependencySchemaInput,
): z.ZodType<NativeInstanceDependencyProposal> {
  return z.strictObject({
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
                  'Exact producer IDs referenced by this instance configuration. Empty means independent. Not execution edges or scheduling preferences. Future roles do not yet have output schemas.',
                ),
              ...(input.includeExplanations && target.sourceNodeIds.length
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
}
