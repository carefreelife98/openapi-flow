import type { WorkflowMessageEvidence } from '@openapi-flow/core';

/** Model input contains identities; the parsed result contains code-owned exact source text. */
export type WorkflowMessageEvidenceSelection = Pick<
  WorkflowMessageEvidence,
  'kind' | 'messageId'
>;

export type WorkflowMessageSelectionOutput<Output> =
  Output extends WorkflowMessageEvidence
    ? WorkflowMessageEvidenceSelection
    : Output extends Array<infer Item>
      ? WorkflowMessageSelectionOutput<Item>[]
      : Output extends object
        ? { [Key in keyof Output]: WorkflowMessageSelectionOutput<Output[Key]> }
        : Output;
