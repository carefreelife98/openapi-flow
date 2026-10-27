import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import {
  createNativeInstanceSelectionSchema,
  resolveNativeInstanceSelection,
} from '@openapi-flow/core';
import type {
  NativeInstanceSelection,
  NativeInstanceSelectionProposal,
} from '@openapi-flow/core';
import type { SelectNativeNodeInstancesInput } from '../types/native-node-planning.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { nativeInstanceSelectionPrompt } from '../prompts/native-node-planning-prompt.js';
import { NativeNodePlanningError } from './native-node-planning-error.js';
import { describeNativeSelectionRequest } from './native-selection/describe-native-planning-request.js';
import { validateNativePlanningRejections } from './native-selection/validate-native-planning-rejections.js';

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
  const request = describeNativeSelectionRequest(input);
  const { context, feedback, requestFingerprint } = request;
  const rejectedProposals = validateNativePlanningRejections({
    stage: 'instance-selection',
    requestFingerprint,
    rejectedProposals: input.rejectedProposals,
  });
  const checkCurrent = (failure?: unknown): void => {
    try {
      if (
        !isDeepStrictEqual(request, describeNativeSelectionRequest(input)) ||
        !isDeepStrictEqual(
          rejectedProposals,
          validateNativePlanningRejections({
            stage: 'instance-selection',
            requestFingerprint,
            rejectedProposals: input.rejectedProposals,
          }),
        )
      )
        throw new Error(
          'Native instance source contracts changed during selection; no automatic rebase',
        );
    } catch (cause) {
      if (failure !== undefined)
        throw new AggregateError(
          [failure, cause],
          'Native selection input changed while a failed model call was received',
          { cause },
        );
      throw cause;
    }
  };
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
            ...(rejectedProposals.length === 0 ? {} : { rejectedProposals }),
          }),
        ),
      ],
      input.signal === undefined ? undefined : { signal: input.signal },
    )
    .catch((error: unknown) => {
      checkCurrent(error);
      throw error;
    });
  input.signal?.throwIfAborted();
  let unchanged = false;
  try {
    checkCurrent();
    unchanged = true;
    return resolveNativeInstanceSelection({ ...input, proposal: output });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new NativeNodePlanningError(
      {
        stage: 'instance-selection',
        output,
        ...(unchanged ? { requestFingerprint } : {}),
      },
      cause,
    );
  }
}
