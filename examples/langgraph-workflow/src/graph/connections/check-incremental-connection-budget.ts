import type {
  IncrementalConnectionInvocationInput,
  IncrementalConnectionLimitFailure,
} from '../../types/incremental-connections.js';
import type { IncrementalConnectionState } from '../../types/incremental-connections.js';

export function countIncrementalConnectionRejections(
  state: IncrementalConnectionState,
): number {
  if (state.rejectedProposals === undefined)
    throw new Error(
      'Connection rejection accounting requires rejectedProposals',
    );
  // Optional on older completed-goal checkpoints: that version never retried a rejected goal.
  return (
    state.rejectedProposals.length + (state.rejectedGoalProposals?.length ?? 0)
  );
}

export class IncrementalConnectionLimitError extends Error {
  readonly failure: IncrementalConnectionLimitFailure;

  constructor(failure: IncrementalConnectionLimitFailure) {
    super(
      `Incremental connection planning exceeded ${failure.kind}: ${failure.observed}/${failure.limit}`,
    );
    this.name = 'IncrementalConnectionLimitError';
    this.failure = failure;
  }
}

export function checkIncrementalConnectionBudget(
  input: IncrementalConnectionInvocationInput,
): void {
  input.config?.signal?.throwIfAborted();
  const { state, policy } = input;
  if (
    state.startedAt === undefined ||
    state.modelInvocations === undefined ||
    state.rejectedProposals === undefined
  )
    throw new Error(
      'Connection budget requires startedAt, modelInvocations and rejectedProposals',
    );
  const elapsed = Date.now() - state.startedAt;
  if (elapsed >= policy.deadlineMs)
    throw new IncrementalConnectionLimitError({
      kind: 'deadline',
      limit: policy.deadlineMs,
      observed: elapsed,
    });
  const rejections = countIncrementalConnectionRejections(state);
  if (rejections > policy.maxRejectedProposals)
    throw new IncrementalConnectionLimitError({
      kind: 'rejected-proposals',
      limit: policy.maxRejectedProposals,
      observed: rejections,
    });
}

export function createIncrementalConnectionSignal(
  input: IncrementalConnectionInvocationInput,
): AbortSignal {
  checkIncrementalConnectionBudget(input);
  if (input.state.startedAt === undefined)
    throw new Error('Connection deadline requires startedAt');
  const deadline = AbortSignal.timeout(
    Math.max(1, input.policy.deadlineMs - (Date.now() - input.state.startedAt)),
  );
  return input.config?.signal
    ? AbortSignal.any([input.config.signal, deadline])
    : deadline;
}
