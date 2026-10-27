import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import {
  createNativeInstanceSelectionSchema,
  describeNativeInstanceSelection,
  resolveNativeInstanceSelection,
  describeNativeInstanceSelectionFeedback,
} from '@openapi-flow/core';
import type {
  NativeInstanceSelection,
  NativeInstanceSelectionProposal,
} from '@openapi-flow/core';
import type { SelectNativeNodeInstancesInput } from '../types/native-node-planning.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { nativeInstanceSelectionPrompt } from '../prompts/native-node-planning-prompt.js';
import { NativeNodePlanningError } from './native-node-planning-error.js';

/** One checkpointable role/ownership selection; parameter values are a separate public stage. */
export async function selectNativeNodeInstances(
  input: SelectNativeNodeInstancesInput,
): Promise<NativeInstanceSelection> {
  input.signal?.throwIfAborted();
  if (
    input.model !== undefined &&
    (!input.model || typeof input.model.withStructuredOutput !== 'function')
  )
    throw new Error(
      'selectNativeNodeInstances.model must support structured output when supplied',
    );
  const { context } = describeNativeInstanceSelection(input);
  const feedback =
    input.feedback === undefined
      ? undefined
      : describeNativeInstanceSelectionFeedback(input, input.feedback);
  const originalOptions = JSON.stringify([
    input.planId,
    input.allowRuntimeParameters,
    input.includeExplanations,
  ]);
  const schema = createNativeInstanceSelectionSchema(input);
  if (!context.capabilities.length)
    return resolveNativeInstanceSelection({
      ...input,
      proposal: {
        instances: [],
        gaps: [],
        ...(input.includeExplanations
          ? { reason: 'No native capabilities were supplied.' }
          : {}),
      },
    });
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'selectNativeNodeInstances.model must support structured output for native choices',
    );
  const output = await input.model
    .withStructuredOutput<NativeInstanceSelectionProposal>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'select_native_node_instances',
        method: 'jsonSchema',
        strict: true,
      },
    )
    .invoke(
      [
        new SystemMessage(nativeInstanceSelectionPrompt),
        new HumanMessage(
          JSON.stringify({
            ...context,
            ...(feedback === undefined ? {} : { selectionFeedback: feedback }),
          }),
        ),
      ],
      input.signal === undefined ? undefined : { signal: input.signal },
    );
  input.signal?.throwIfAborted();
  try {
    if (
      !isDeepStrictEqual(
        describeNativeInstanceSelection(input).context,
        context,
      ) ||
      !isDeepStrictEqual(
        feedback,
        input.feedback === undefined
          ? undefined
          : describeNativeInstanceSelectionFeedback(input, input.feedback),
      ) ||
      JSON.stringify([
        input.planId,
        input.allowRuntimeParameters,
        input.includeExplanations,
      ]) !== originalOptions
    )
      throw new Error(
        'Native instance source contracts changed during selection; no automatic rebase',
      );
    return resolveNativeInstanceSelection({ ...input, proposal: output });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new NativeNodePlanningError(
      { stage: 'instance-selection', output },
      cause,
    );
  }
}
