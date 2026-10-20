import type { DeferredApiInputIssue } from '../types/deferred-api-inputs.js';

export class DeferredApiInputError extends Error {
  readonly issues: DeferredApiInputIssue[];

  constructor(issues: DeferredApiInputIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.name = 'DeferredApiInputError';
    this.issues = structuredClone(issues);
  }
}
