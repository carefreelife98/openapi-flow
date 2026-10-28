import type { z } from 'zod';
import type {
  BindingSchema,
  WorkflowNativeMaterialSources,
  WorkflowValueReference,
  JsonValue,
} from '@openapi-flow/core';
import type {
  NativeItemExecutionOptions,
  CompileNativeNodeInput,
} from './native-capability.js';
import type {
  responseEvaluationParametersSchema,
  responseEvaluationStatusSchema,
  responseEvaluationComparisonSchema,
} from '../schemas/response-evaluation-schema.js';

export type ResponseEvaluationParameters = z.infer<
  typeof responseEvaluationParametersSchema
>;
export type ResponseEvaluationRule =
  ResponseEvaluationParameters['checks'][number];
export type ResponseEvaluationStatus = z.infer<
  typeof responseEvaluationStatusSchema
>;
export type ResponseEvaluationComparison = z.infer<
  typeof responseEvaluationComparisonSchema
>;
export type ResponseEvaluationPolicy = Pick<
  ResponseEvaluationComparison,
  'measurement' | 'cases' | 'otherwise'
>;
export interface ResponseEvaluationResultBase {
  ruleIndex: number;
  source: WorkflowValueReference;
}
export interface ResponseEvaluationComparedResult extends ResponseEvaluationResultBase {
  status: ResponseEvaluationStatus;
  reason: 'matched-case' | 'unmatched';
  actualValue: JsonValue;
  measuredValue?: number;
  matchedCaseIndex?: number;
  policy: ResponseEvaluationPolicy;
}
export interface ResponseEvaluationMissingResult extends ResponseEvaluationResultBase {
  status: 'undetermined';
  reason: 'missing-value' | 'empty-collection';
  policy?: ResponseEvaluationPolicy;
}
export interface ResponseEvaluationUnassessedResult extends ResponseEvaluationResultBase {
  status: 'undetermined';
  reason: 'no-rule';
}
export type ResponseEvaluationCheckResult =
  | ResponseEvaluationComparedResult
  | ResponseEvaluationMissingResult
  | ResponseEvaluationUnassessedResult;
export interface ResponseEvaluationResult {
  checks: ResponseEvaluationCheckResult[];
  summary: Record<ResponseEvaluationStatus, number>;
}
export interface CreateResponseEvaluationCapabilityInput extends NativeItemExecutionOptions {
  sources: WorkflowNativeMaterialSources;
}
export interface ResponseEvaluationRuleContract {
  rule: ResponseEvaluationRule;
  valueSchema?: BindingSchema;
}
export interface CompileResponseEvaluationInput extends CompileNativeNodeInput {
  parameters: ResponseEvaluationParameters;
  linked: boolean;
}
