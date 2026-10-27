import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import {
  describeApiLiteralGeneration,
  inspectApiArgumentRequirements,
} from '@openapi-flow/core';
import type { ApiCallArguments } from '@openapi-flow/core';
import {
  generateApiArguments,
  createApiArgumentRejection,
  apiLiteralGenerationOptionsSchema,
} from '@openapi-flow/langchain';
import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  ApiArgumentPlanningDependencies,
  ApiArgumentPlanningSource,
  ApiArgumentPlanningState,
  ApiArgumentPlanningUpdate,
  ApiArgumentPlanningRuntimeFailure,
} from '../../types/api-argument-planning.js';
import {
  ApiArgumentPlanningLimitError,
  checkApiArgumentPlanningBudget,
  createApiArgumentPlanningSignal,
} from './check-api-argument-planning-budget.js';
import { publishApiArgumentProgress } from './publish-api-argument-progress.js';

function readSource(
  dependencies: ApiArgumentPlanningDependencies,
): ApiArgumentPlanningSource {
  const supplied = dependencies.source();
  const { input } = describeApiLiteralGeneration(supplied);
  const options = apiLiteralGenerationOptionsSchema.parse({
    includeExplanations: supplied.includeExplanations,
    selectOasEnums: supplied.selectOasEnums,
    trackRequestedInputs: supplied.trackRequestedInputs,
  });
  return {
    ...input,
    ...(options.includeExplanations === undefined
      ? {}
      : { includeExplanations: options.includeExplanations }),
    ...(options.selectOasEnums === undefined
      ? {}
      : { selectOasEnums: options.selectOasEnums }),
    ...(options.trackRequestedInputs === undefined
      ? {}
      : { trackRequestedInputs: options.trackRequestedInputs }),
  };
}

/** This host composition stores JSON receipts only; runtime errors remain outside checkpoints. */
export function createApiArgumentPlanningStages(
  dependencies: ApiArgumentPlanningDependencies,
) {
  let lastRejectedError: unknown;
  let failure: ApiArgumentPlanningRuntimeFailure | undefined;
  async function invokeGeneration(
    execute: () => Promise<ApiArgumentPlanningUpdate>,
  ): Promise<ApiArgumentPlanningUpdate> {
    try {
      return await execute();
    } catch (error) {
      failure = { id: randomUUID(), error };
      return { failureId: failure.id };
    }
  }
  const assertSource = (state: ApiArgumentPlanningState, cause?: unknown) => {
    if (state.source === undefined || state.policy === undefined)
      throw new Error(
        'API argument planning is missing its original source or policy',
        { cause },
      );
    if (
      !isDeepStrictEqual(state.source, readSource(dependencies)) ||
      !isDeepStrictEqual(state.policy, dependencies.policy)
    )
      throw new Error(
        'API argument planning source or policy changed; start a new planning attempt',
        { cause },
      );
  };
  const check = (
    state: ApiArgumentPlanningState,
    config?: RunnableConfig,
    cause?: unknown,
  ) => {
    assertSource(state, cause);
    checkApiArgumentPlanningBudget({
      state,
      config,
      policy: dependencies.policy,
      cause,
    });
  };
  return {
    initialize(state: ApiArgumentPlanningState): ApiArgumentPlanningUpdate {
      if (state.source === undefined) {
        if (Object.values(state).some((value) => value !== undefined))
          throw new Error(
            'API argument planning must start empty or from a complete checkpoint',
          );
        return {
          source: readSource(dependencies),
          policy: structuredClone(dependencies.policy),
          startedAt: Date.now(),
          attempts: 0,
          rejectedProposals: [],
          status: 'planning',
        };
      }
      assertSource(state);
      if (
        state.startedAt === undefined ||
        state.attempts === undefined ||
        state.rejectedProposals === undefined ||
        state.status === undefined
      )
        throw new Error(
          'API argument checkpoint is missing its original counters or status',
        );
      if (state.status === 'complete') {
        if (state.arguments === undefined)
          throw new Error(
            'Completed API argument checkpoint is missing arguments',
          );
        inspectApiArgumentRequirements({
          operation: state.source.operation,
          ...state.arguments,
        });
      } else if (state.arguments !== undefined)
        throw new Error(
          'Unfinished API argument checkpoint cannot contain completed arguments',
        );
      return {};
    },
    reserve(
      state: ApiArgumentPlanningState,
      config?: RunnableConfig,
    ): ApiArgumentPlanningUpdate {
      check(state, config, lastRejectedError);
      if (state.attempts === undefined)
        throw new Error('API argument reservation requires attempts');
      if (state.attempts >= dependencies.policy.maxAttempts)
        throw new ApiArgumentPlanningLimitError(
          {
            kind: 'attempts',
            limit: dependencies.policy.maxAttempts,
            observed: state.attempts,
          },
          lastRejectedError,
        );
      return { attempts: state.attempts + 1 };
    },
    async generate(
      state: ApiArgumentPlanningState,
      config?: RunnableConfig,
    ): Promise<ApiArgumentPlanningUpdate> {
      return invokeGeneration(async () => {
        check(state, config, lastRejectedError);
        if (state.source === undefined || state.rejectedProposals === undefined)
          throw new Error(
            'API argument generation requires its original source and rejection history',
          );
        const signal = createApiArgumentPlanningSignal({
          state,
          config,
          policy: dependencies.policy,
        });
        let result: ApiCallArguments;
        try {
          result = await generateApiArguments({
            ...state.source,
            model: dependencies.model,
            rejectedProposals: state.rejectedProposals,
            signal,
          });
        } catch (error) {
          check(state, config, error);
          const rejection = createApiArgumentRejection({
            ...state.source,
            error,
          });
          if (rejection === undefined) throw error;
          lastRejectedError = error;
          return {
            rejectedProposals: [...state.rejectedProposals, rejection],
            status: 'planning',
          };
        }
        check(state, config);
        return { arguments: result, status: 'complete' };
      });
    },
    fail(state: ApiArgumentPlanningState): never {
      if (!state.failureId || !failure || state.failureId !== failure.id)
        throw new Error(
          'Original API argument failure is unavailable in this run runtime',
        );
      throw failure.error;
    },
    async publishAttempt(
      state: ApiArgumentPlanningState,
      config?: RunnableConfig,
    ): Promise<ApiArgumentPlanningUpdate> {
      check(state, config, lastRejectedError);
      if (state.attempts === undefined || state.rejectedProposals === undefined)
        throw new Error('API argument progress requires counters');
      try {
        await publishApiArgumentProgress(
          {
            callId: state.source!.callId,
            phase: 'started',
            attempts: state.attempts,
            rejectedProposals: state.rejectedProposals.length,
          },
          createApiArgumentPlanningSignal({
            state,
            config,
            policy: dependencies.policy,
          }),
          dependencies.observe,
        );
      } catch (error) {
        check(state, config, error);
        throw error;
      }
      return {};
    },
    async publishOutcome(
      state: ApiArgumentPlanningState,
      config?: RunnableConfig,
    ): Promise<ApiArgumentPlanningUpdate> {
      assertSource(state, lastRejectedError);
      config?.signal?.throwIfAborted();
      if (state.attempts === undefined || state.rejectedProposals === undefined)
        throw new Error('API argument progress requires counters');
      try {
        await publishApiArgumentProgress(
          {
            callId: state.source!.callId,
            phase: state.status === 'complete' ? 'completed' : 'rejected',
            attempts: state.attempts,
            rejectedProposals: state.rejectedProposals.length,
          },
          createApiArgumentPlanningSignal({
            state,
            config,
            policy: dependencies.policy,
            cause: lastRejectedError,
          }),
          dependencies.observe,
        );
      } catch (error) {
        check(state, config, error);
        throw error;
      }
      return {};
    },
  };
}
