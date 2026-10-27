import { z } from 'zod';
import type {
  NativeNodeParameterProposal,
  NativeParameterGenerationContract,
} from '../types/native-node-planning.js';

/** One shared value/question wire contract for initial configuration and existing-instance repair. */
export function createNativeNodeParameterProposalSchema(
  contract: NativeParameterGenerationContract,
  includeExplanations: boolean,
): z.ZodType<NativeNodeParameterProposal> {
  const reasons = includeExplanations ? { reason: z.string().min(1) } : {};
  return z
    .strictObject({
      decision: z.union([
        z.strictObject({
          status: z.literal('provided'),
          parameters: contract.valuesSchema.describe(
            'Only the selected target instance settings not owned by execution-time inputs. No existing target output is required to choose literals.',
          ),
          ...reasons,
        }),
        z.strictObject({
          status: z.literal('needs-clarification'),
          message: z
            .string()
            .min(1)
            .describe(
              'Ask only for missing settings or producer references required by this selected implementation contract, never for a prepared copy/output of the target being created.',
            ),
          ...reasons,
        }),
      ]),
    })
    .meta({
      $defs: contract.definitions,
    }) as z.ZodType<NativeNodeParameterProposal>;
}
