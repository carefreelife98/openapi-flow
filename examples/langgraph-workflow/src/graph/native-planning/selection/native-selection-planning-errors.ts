import type {
  NativeSelectionPlanningLimitFailure,
  NativeSelectionPlanningStoppedFailure,
} from '../../../types/native-selection-planning.js';

export class NativeSelectionPlanningLimitError extends Error {
  readonly failure: NativeSelectionPlanningLimitFailure;
  constructor(failure: NativeSelectionPlanningLimitFailure) {
    super(
      `Native selection planning exceeded ${failure.kind}: ${failure.observed}/${failure.limit}`,
    );
    this.name = 'NativeSelectionPlanningLimitError';
    this.failure = failure;
  }
}
export class NativeSelectionPlanningStoppedError extends Error {
  readonly failure: NativeSelectionPlanningStoppedFailure;
  constructor(failure: NativeSelectionPlanningStoppedFailure) {
    super(
      `Native selection planning stopped with ${failure.receipt.status}; original selection and review are preserved`,
    );
    this.name = 'NativeSelectionPlanningStoppedError';
    this.failure = failure;
  }
}
