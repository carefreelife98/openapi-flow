import { z } from 'zod';
import type {
  NativeNodeParameterProposal,
  NativeParameterGenerationContract,
} from '../types/native-node-planning.js';
import { optionalPlanningExplanationSchema } from './optional-planning-explanation-schema.js';
import { validateNativeParameterQuestion } from '../workflow/planning/validate-native-parameter-question.js';

/** One shared value/question wire contract for initial configuration and existing-instance repair. */
export function createNativeNodeParameterProposalSchema(
  contract: NativeParameterGenerationContract,
  includeExplanations: boolean,
  requireExplanations = true,
): z.ZodType<NativeNodeParameterProposal> {
  const reasons = requireExplanations
    ? includeExplanations
      ? { reason: z.string().min(1) }
      : {}
    : { reason: optionalPlanningExplanationSchema };
  const schema = z
    .strictObject({
      decision: z.union([
        z.strictObject({
          status: z.literal('provided'),
          parameters: contract.valuesSchema.describe(
            'Only the selected target instance settings not owned by execution-time inputs. No existing target output is required to choose literals.',
          ),
          ...reasons,
        }),
        ...(contract.parameterValuePolicy === undefined ||
        contract.parameterValuePolicy.businessInputPaths.length === 0
          ? []
          : [
              z.strictObject({
                status: z.literal('needs-clarification'),
                fieldPointers: z
                  .array(z.string().regex(/^(?:\/(?:[^~]|~[01])*)?$/u))
                  .min(1)
                  .describe(
                    'Exact missing business input fields permitted by parameterValuePolicy. Never generated text or internal producer references.',
                  ),
                message: z
                  .string()
                  .min(1)
                  .describe(
                    'Ask only for missing business values required by this selected implementation. Internal references and contracts belong to needs-materials, never a user question.',
                  ),
                ...reasons,
              }),
            ]),
        z.strictObject({
          status: z.literal('needs-materials'),
          message: z
            .string()
            .min(1)
            .describe(
              'Name the source and missing internal contract or reference. This is a system limitation, never a user question or permission to invent data.',
            ),
          ...reasons,
        }),
      ]),
    })
    .meta({
      $defs: contract.definitions,
    }) as z.ZodType<NativeNodeParameterProposal>;
  const checked = schema.superRefine((proposal, ctx) => {
    try {
      validateNativeParameterQuestion(
        proposal,
        contract.parameterValuePolicy,
        contract.literalParametersSchema,
      );
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message:
          error instanceof Error
            ? error.message
            : 'Invalid native business question',
      });
    }
  });
  if (requireExplanations) return checked;
  return checked.transform((proposal) => {
    const decision = { ...proposal.decision };
    if (!includeExplanations || decision.reason === undefined)
      delete decision.reason;
    return { decision };
  }) as z.ZodType<NativeNodeParameterProposal>;
}
