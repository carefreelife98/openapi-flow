import {
  describeApiBindingPlanning,
  validateApiCallBindingPlan,
  assembleApiBindingPlan,
  runOpenApiFlowOperation,
  isOpenApiFlowError,
} from '@openapi-flow/core';
import type { ApiBindingPlan, ApiCallBindingPlan } from '@openapi-flow/core';
import type { PlanApiBindingsByCallInput } from '../types/api-call-binding-planning.js';
import { apiBindingCallExecutionSchema } from '../schemas/api-call-binding-plan-schema.js';
import { selectApiBindingSources } from './select-api-binding-sources.js';
import { planApiCallBindings } from './plan-api-call-bindings.js';

/** Resource-bounded scheduling; each result can also be checkpointed by a host graph. */
export async function planApiBindingsByCall(
  input: PlanApiBindingsByCallInput,
): Promise<ApiBindingPlan> {
  const { snapshot, concurrency, completed } = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'planApiBindingsByCall',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const { concurrency } = apiBindingCallExecutionSchema.parse(input);
      if (
        input.onCallPlanned !== undefined &&
        typeof input.onCallPlanned !== 'function'
      )
        throw new Error('onCallPlanned must be a function when supplied');
      const snapshot = describeApiBindingPlanning(input).input;
      const completed =
        input.completedCalls === undefined
          ? []
          : structuredClone(input.completedCalls);
      if (!Array.isArray(completed))
        throw new Error('completedCalls must be an array');
      if (
        new Set(completed.map((item) => item.callId)).size !== completed.length
      )
        throw new Error(
          'completedCalls contains duplicate API call identities',
        );
      for (const result of completed)
        validateApiCallBindingPlan({
          ...snapshot,
          callId: result.callId,
          includeExplanations: input.includeExplanations,
          result,
        });
      return { snapshot, concurrency, completed };
    },
  );
  input.signal?.throwIfAborted();
  const results = new Map<string, ApiCallBindingPlan>(
    completed.map((result) => [result.callId, result]),
  );
  const pending = snapshot.materials.filter(
    (material) => !results.has(material.callId),
  );
  let next = 0;
  let failed = false;
  let failure: unknown;
  async function worker(): Promise<void> {
    while (!failed && next < pending.length) {
      const material = pending[next++];
      try {
        input.signal?.throwIfAborted();
        const callInput = {
          ...snapshot,
          callId: material.callId,
          includeExplanations: input.includeExplanations,
          model: input.model,
          signal: input.signal,
        };
        const sources = await selectApiBindingSources(callInput);
        if (failed) return;
        const result = await planApiCallBindings({ ...callInput, sources });
        input.signal?.throwIfAborted();
        if (input.onCallPlanned !== undefined)
          await input.onCallPlanned(structuredClone(result));
        results.set(result.callId, result);
      } catch (error) {
        if (!failed) {
          // This aggregate API historically returns the caller's exact cancellation reason.
          // A late structured result must not change that public cancellation contract.
          failure =
            input.signal?.aborted &&
            isOpenApiFlowError(error) &&
            error.diagnostic.code === 'MODEL_ABORTED' &&
            error.cause === input.signal.reason
              ? input.signal.reason
              : error;
        }
        failed = true;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, () =>
      worker(),
    ),
  );
  if (failed) throw failure;
  input.signal?.throwIfAborted();
  return assembleApiBindingPlan({
    ...snapshot,
    results: [...results.values()],
    includeExplanations: input.includeExplanations,
  });
}
