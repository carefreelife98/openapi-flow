import { z } from 'zod';
import type {
  NativeInstanceSelectionInput,
  NativeInstanceSelectionProposal,
  NativeNodeConfigurationInput,
  NativeNodeParameterProposal,
  NativeNodeConfigurationReply,
} from '../types/native-node-planning.js';
import { describeNativeInstanceSelection } from '../workflow/planning/resolve-native-instance-selection.js';
import { resolveNativeConfigurationMaterials } from '../workflow/planning/resolve-native-configuration-materials.js';
import { createNativeNodeParameterProposalSchema } from './create-native-node-parameter-proposal-schema.js';

/** User answers are data, not model output and not permission to change the selected role. */
export const nativeNodeConfigurationRepliesSchema = z.array(
  z.strictObject({
    question: z.strictObject({
      status: z.literal('needs-clarification'),
      id: z.string().min(1),
      fingerprint: z.string().min(1),
      nodeId: z.string().min(1),
      message: z.string().min(1),
      proposal: z.strictObject({
        decision: z.strictObject({
          status: z.literal('needs-clarification'),
          message: z.string().min(1),
          reason: z.string().min(1).optional(),
        }),
      }),
    }),
    text: z
      .string()
      .regex(
        /\S/u,
        'Native configuration reply text must contain a non-whitespace character',
      ),
  }),
) satisfies z.ZodType<NativeNodeConfigurationReply[]>;

export function createNativeInstanceSelectionSchema(
  input: NativeInstanceSelectionInput,
): z.ZodType<NativeInstanceSelectionProposal> {
  if (
    input.includeExplanations !== undefined &&
    typeof input.includeExplanations !== 'boolean'
  )
    throw new Error('native instance includeExplanations must be a boolean');
  const { context } = describeNativeInstanceSelection(input);
  const reasons =
    input.includeExplanations === true ? { reason: z.string().min(1) } : {};
  const choices: z.ZodType[] = context.capabilities.flatMap((capability) => {
    const fields = {
      capability: z.literal(capability.name).describe(capability.description),
      purpose: z
        .string()
        .min(1)
        .describe(
          'Distinct scenario role for this NEW instance. Repeated capability choices must describe different roles; never repeat a supplied prepared instance.',
        ),
      ...reasons,
    };
    const variants: z.ZodType[] = [
      z.strictObject({
        ...fields,
        parameterSource: z
          .literal('literal')
          .describe(
            'Plan-time settings, including values that the next value stage must ask the user to supply. Selection does not require parameter values to be known already.',
          ),
      }),
    ];
    if (capability.parameterSources.includes('workflow-input'))
      variants.push(
        z.strictObject({
          ...fields,
          parameterSource: z.literal('workflow-input'),
        }),
      );
    if (capability.parameterSources.includes('workflow-fields'))
      variants.push(
        z.strictObject({
          ...fields,
          parameterSource: z.literal('workflow-fields'),
          pointers: z
            .array(
              z
                .string()
                .min(1)
                .describe(
                  'Explicit RFC 6901 field to supply at execution. No slot IDs, schemas or values.',
                ),
            )
            .min(1),
        }),
      );
    return variants;
  });
  return z.strictObject({
    instances: z
      .array(choices.length ? z.union(choices) : z.never())
      .describe(
        'NEW roles supported by supplied implementations. Select supported roles even when their plan-time literal values still need clarification in the separate value stage.',
      ),
    gaps: z
      .array(
        z.strictObject({
          description: z
            .string()
            .min(1)
            .describe(
              'Only requested behavior not representable by the supplied native implementations. Missing literal settings are questions for the separate value stage, never capability gaps.',
            ),
        }),
      )
      .describe(
        'Unmet native behavior only; do not block role selection because parameter values are not yet supplied.',
      ),
    ...reasons,
  }) as z.ZodType<NativeInstanceSelectionProposal>;
}

export function createNativeNodeParametersSchema(
  input: NativeNodeConfigurationInput,
): z.ZodType<NativeNodeParameterProposal> {
  const { contract } = resolveNativeConfigurationMaterials(input);
  return createNativeNodeParameterProposalSchema(
    contract,
    input.includeExplanations === true,
  );
}
