import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  createNativeNodeParametersSchema,
  describeNativeNodeConfiguration,
  resolveNativeNodeParameters,
  resolveNativeProducerParameters,
} from '@openapi-flow/core';
import type {
  NativeNodeParameterProposal,
  NativeNodeParameterResult,
} from '@openapi-flow/core';
import type { GenerateNativeNodeParametersInput } from '../types/native-node-planning.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { nativeNodeParametersPrompt } from '../prompts/native-node-planning-prompt.js';
import { NativeNodePlanningError } from './native-node-planning-error.js';

/** Zero or one value call for one selected instance; no hidden ownership or connection planning. */
export async function generateNativeNodeParameters(
  input: GenerateNativeNodeParametersInput,
): Promise<NativeNodeParameterResult> {
  input.signal?.throwIfAborted();
  if (
    input.model !== undefined &&
    (!input.model || typeof input.model.withStructuredOutput !== 'function')
  )
    throw new Error(
      'generateNativeNodeParameters.model must support structured output when supplied',
    );
  const derived = resolveNativeProducerParameters(input);
  if (derived !== undefined) return derived;
  const description = describeNativeNodeConfiguration(input);
  if (!description.instance.hasLiteralParameters)
    return resolveNativeNodeParameters({
      ...input,
      fingerprint: description.fingerprint,
      proposal: {
        decision: {
          status: 'provided',
          parameters: {},
          ...(input.includeExplanations
            ? {
                reason:
                  'The validated ownership contract leaves no literal parameter choice.',
              }
            : {}),
        },
      },
    });
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'generateNativeNodeParameters.model must support structured output for remaining values',
    );
  const schema = createNativeNodeParametersSchema(input);
  const validationSchema = createNativeNodeParametersSchema(input, false);
  const capability = description.context.capabilities.find(
    (entry) => entry.name === description.instance.capability,
  );
  if (!capability)
    throw new Error(
      'Native parameter generation has no selected capability material',
    );
  const output = await input.model
    .withStructuredOutput<NativeNodeParameterProposal>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'generate_native_node_parameters',
        method: 'jsonSchema',
        strict: true,
      },
    )
    .invoke(
      [
        new SystemMessage(nativeNodeParametersPrompt),
        new HumanMessage(
          JSON.stringify({
            scenario: description.context.scenario,
            purpose: description.instance.purpose,
            target: {
              id: description.instance.id,
              capability: {
                name: capability.name,
                description: capability.description,
              },
            },
            selectedRoles: description.selectedRoles,
            parametersSchema: description.instance.literalParametersSchema,
            runtimeParameters: description.instance.runtimeParameters,
            apiMaterials: description.context.apiMaterials,
            preparedNativeNodes: description.context.preparedNativeNodes,
            configuredNodes: description.configuredNodes,
            outputs: description.outputs,
            ...(description.sourceDependencies === undefined
              ? {}
              : { sourceDependencies: description.sourceDependencies }),
            ...(description.replies === undefined
              ? {}
              : { replies: description.replies }),
          }),
        ),
      ],
      input.signal === undefined ? undefined : { signal: input.signal },
    );
  input.signal?.throwIfAborted();
  try {
    // Validate output separately so callers can distinguish a malformed reply from stale source material.
    validationSchema.parse(output);
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new NativeNodePlanningError(
      { stage: 'parameter-schema', output },
      cause,
    );
  }
  try {
    return resolveNativeNodeParameters({
      ...input,
      fingerprint: description.fingerprint,
      proposal: output,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new NativeNodePlanningError(
      { stage: 'parameter-validation', output },
      cause,
    );
  }
}
