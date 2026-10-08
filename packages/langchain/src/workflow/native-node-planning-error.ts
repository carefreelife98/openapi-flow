import type { NativeNodePlanningFailure } from '../types/native-node-planning.js';

export class NativeNodePlanningError extends Error {
  readonly failure: NativeNodePlanningFailure;
  constructor(failure: NativeNodePlanningFailure, cause: Error) {
    super(`Native node planning failed at ${failure.stage}: ${cause.message}`, {
      cause,
    });
    this.name = 'NativeNodePlanningError';
    this.failure = failure;
  }
}
