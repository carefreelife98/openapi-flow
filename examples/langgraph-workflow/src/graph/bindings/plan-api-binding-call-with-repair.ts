import {
  createApiCallBindingRejection,
  planApiCallBindings,
} from '@openapi-flow/langchain';
import type { ApiCallBindingPlan } from '@openapi-flow/core';
import type { ApiBindingCallRepairInput } from '../../types/api-binding-call-repair.js';

/** Host composition: repair only this rejected call; transport and business ambiguity are not retried. */
export async function planApiBindingCallWithRepair(
  input: ApiBindingCallRepairInput,
): Promise<ApiCallBindingPlan> {
  if (
    !Number.isSafeInteger(input.maxRejectedProposals) ||
    input.maxRejectedProposals < 0
  )
    throw new Error('maxRejectedProposals must be a nonnegative safe integer');
  const rejectedProposals = structuredClone(input.rejectedProposals ?? []);
  if (rejectedProposals.length > input.maxRejectedProposals)
    throw new Error(
      'Existing binding rejections exceed the host repair budget',
    );
  for (;;) {
    input.signal?.throwIfAborted();
    await input.beforeAttempt?.(rejectedProposals.length + 1);
    try {
      return await planApiCallBindings({ ...input, rejectedProposals });
    } catch (error) {
      input.signal?.throwIfAborted();
      const rejection = createApiCallBindingRejection({ ...input, error });
      if (
        rejection === undefined ||
        rejectedProposals.length >= input.maxRejectedProposals
      )
        throw error;
      rejectedProposals.push(rejection);
      await input.onRejected?.(rejectedProposals.length);
    }
  }
}
