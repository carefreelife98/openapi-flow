import type { z } from 'zod';
import type { OpenApiFlowError } from '@openapi-flow/core';
import type { apiCallBindingRejectionSchema } from '../schemas/api-call-binding-rejection-schema.js';
import type { PlanApiCallBindingsInput } from './api-call-binding-planning.js';

export type ApiCallBindingRejection = z.infer<
  typeof apiCallBindingRejectionSchema
>;
export interface ApiCallBindingPlanningFailure {
  error: OpenApiFlowError;
  sourceFingerprint: string;
  output: unknown;
}
export interface CreateApiCallBindingRejectionInput extends Omit<
  PlanApiCallBindingsInput,
  'model' | 'signal' | 'rejectedProposals'
> {
  error: unknown;
}
