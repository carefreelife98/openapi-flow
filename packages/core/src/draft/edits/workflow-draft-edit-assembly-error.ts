import type { WorkflowDraftEditAssemblyFailure } from '../../types/workflow-draft-edit-assembly.js';

export class WorkflowDraftEditAssemblyError extends Error {
  readonly failure: WorkflowDraftEditAssemblyFailure;
  constructor(failure: WorkflowDraftEditAssemblyFailure, cause: Error) {
    super(`Draft edit assembly failed at ${failure.stage}: ${cause.message}`, {
      cause,
    });
    this.name = 'WorkflowDraftEditAssemblyError';
    this.failure = structuredClone(failure);
  }
}
