import type { PlanApiCallBindingsInput } from '@openapi-flow/langchain';

export interface ApiBindingCallRepairInput extends PlanApiCallBindingsInput {
  /** Host policy, independent of OAS acceptance and selected API count. Zero disables repair. */
  maxRejectedProposals: number;
  beforeAttempt?: (attempt: number) => void | Promise<void>;
  onRejected?: (rejectedCount: number) => void | Promise<void>;
}
