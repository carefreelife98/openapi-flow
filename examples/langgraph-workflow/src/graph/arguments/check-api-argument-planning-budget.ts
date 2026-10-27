import type {
  ApiArgumentPlanningInvocation,
  ApiArgumentPlanningLimitFailure,
} from '../../types/api-argument-planning.js';

export class ApiArgumentPlanningLimitError extends Error {
  readonly failure: ApiArgumentPlanningLimitFailure;

  constructor(failure: ApiArgumentPlanningLimitFailure, cause?: unknown) {
    super(
      `API argument planning exceeded ${failure.kind}: ${failure.observed}/${failure.limit}`,
      { cause },
    );
    this.name = 'ApiArgumentPlanningLimitError';
    this.failure = failure;
  }
}

export function checkApiArgumentPlanningBudget(
  input: ApiArgumentPlanningInvocation,
): void {
  input.config?.signal?.throwIfAborted();
  const { state, policy } = input;
  if (
    state.startedAt === undefined ||
    state.attempts === undefined ||
    state.rejectedProposals === undefined
  )
    throw new Error(
      'API argument budget requires startedAt, attempts and rejectedProposals',
    );
  const elapsed = Date.now() - state.startedAt;
  if (elapsed < 0)
    throw new Error('API argument deadline clock moved before startedAt');
  if (elapsed >= policy.deadlineMs)
    throw new ApiArgumentPlanningLimitError(
      { kind: 'deadline', limit: policy.deadlineMs, observed: elapsed },
      input.cause,
    );
  if (state.rejectedProposals.length > policy.maxRejectedProposals)
    throw new ApiArgumentPlanningLimitError(
      {
        kind: 'rejected-proposals',
        limit: policy.maxRejectedProposals,
        observed: state.rejectedProposals.length,
      },
      input.cause,
    );
}

export function createApiArgumentPlanningSignal(
  input: ApiArgumentPlanningInvocation,
): AbortSignal {
  checkApiArgumentPlanningBudget(input);
  if (input.state.startedAt === undefined)
    throw new Error('API argument deadline requires startedAt');
  const remaining =
    input.policy.deadlineMs - (Date.now() - input.state.startedAt);
  if (remaining <= 0)
    throw new ApiArgumentPlanningLimitError(
      {
        kind: 'deadline',
        limit: input.policy.deadlineMs,
        observed: input.policy.deadlineMs,
      },
      input.cause,
    );
  const deadline = AbortSignal.timeout(remaining);
  return input.config?.signal === undefined
    ? deadline
    : AbortSignal.any([input.config.signal, deadline]);
}
