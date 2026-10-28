import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeNativeInstanceSelectionReview,
  createNativeInstanceSelectionReview,
  createNativeInstanceSelectionReviewSchema,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type {
  NativeInstanceSelectionReview,
  NativeInstanceSelectionReviewProposal,
} from '@openapi-flow/core';
import type { ReviewNativeInstanceSelectionInput } from '../../types/native-instance-selection-review.js';
import { invokeStructuredModel } from '../../model/invoke-structured-model.js';
import { serializeStructuredOutputSchema } from '../../schemas/serialize-structured-output-schema.js';
import { modelSignalSchema } from '../../schemas/model-signal-schema.js';
import { nativeInstanceSelectionReviewPrompt } from '../../prompts/native-instance-selection-review-prompt.js';
import { NativeInstanceSelectionReviewError } from './native-instance-selection-review-error.js';
import { fingerprintNativeSelectionReviewRequest } from './describe-native-planning-request.js';
import { validateNativePlanningRejections } from './validate-native-planning-rejections.js';
import { createNativeSelectionModelContext } from './create-native-selection-model-context.js';
import { nativeMaterialSourceReferencesPrompt } from '../../prompts/native-node-planning-prompt.js';

/** One review call only. The host owns replanning, user questions, budgets and persistence. */
export async function reviewNativeInstanceSelection(
  input: ReviewNativeInstanceSelectionInput,
): Promise<NativeInstanceSelectionReview> {
  const operation = 'reviewNativeInstanceSelection';
  const description = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation,
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      modelSignalSchema.parse(input.signal);
      return describeNativeInstanceSelectionReview(input);
    },
  );
  input.signal?.throwIfAborted();
  const requestFingerprint = fingerprintNativeSelectionReviewRequest(input);
  const rejectedProposals = validateNativePlanningRejections({
    stage: 'selection-review',
    requestFingerprint,
    rejectedProposals: input.rejectedProposals,
  });
  if (!description.gaps.length && description.reviewInstances !== true)
    return createNativeInstanceSelectionReview({
      ...input,
      proposal: { assessments: {} },
    });
  const model = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation,
      stage: 'model-configuration',
      code: 'MODEL_CONFIGURATION_FAILED',
    },
    () => {
      if (
        !input.model ||
        typeof input.model.withStructuredOutput !== 'function'
      )
        throw new Error(
          'reviewNativeInstanceSelection.model must support structured output for the requested review',
        );
      return input.model;
    },
  );
  const checkCurrent = (originalFailure?: unknown): void => {
    runOpenApiFlowOperation(
      {
        owner: 'langchain',
        operation,
        stage: 'input-validation',
        code: 'PLANNING_INPUT_INVALID',
      },
      () => {
        try {
          if (
            !isDeepStrictEqual(
              description,
              describeNativeInstanceSelectionReview(input),
            ) ||
            !isDeepStrictEqual(
              rejectedProposals,
              validateNativePlanningRejections({
                stage: 'selection-review',
                requestFingerprint,
                rejectedProposals: input.rejectedProposals,
              }),
            )
          )
            throw new Error(
              'Native selection review source changed during model invocation',
            );
        } catch (error) {
          if (originalFailure !== undefined)
            throw new AggregateError(
              [originalFailure, error],
              'Native review input changed while a failed model call was received',
              { cause: error },
            );
          throw error;
        }
      },
    );
  };
  const output =
    await invokeStructuredModel<NativeInstanceSelectionReviewProposal>({
      operation,
      model,
      schema: serializeStructuredOutputSchema(
        createNativeInstanceSelectionReviewSchema(description),
        'draft-2020-12',
      ),
      name: 'review_native_instance_selection',
      method: 'jsonSchema',
      strict: true,
      messages: [
        new SystemMessage(
          `${nativeInstanceSelectionReviewPrompt}\n${nativeMaterialSourceReferencesPrompt}`,
        ),
        new HumanMessage(
          JSON.stringify({
            ...description,
            context: createNativeSelectionModelContext(description.context),
            ...(rejectedProposals.length === 0 ? {} : { rejectedProposals }),
          }),
        ),
      ],
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    }).catch((error: unknown) => {
      checkCurrent(error);
      throw error;
    });
  checkCurrent();
  try {
    return createNativeInstanceSelectionReview({ ...input, proposal: output });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new NativeInstanceSelectionReviewError(
      { output, requestFingerprint },
      cause,
    );
  }
}
