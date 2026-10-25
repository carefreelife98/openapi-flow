import { z } from 'zod';

/** A closed, browser-safe projection. Raw errors and user data never belong here. */
export const openApiFlowErrorCodeSchema = z.enum([
  'PLANNING_INPUT_INVALID',
  'OAS_VALIDATION_FAILED',
  'OAS_RESOLUTION_FAILED',
  'MODEL_CONFIGURATION_FAILED',
  'MODEL_INVOCATION_FAILED',
  'MODEL_TIMEOUT',
  'MODEL_ABORTED',
  'MODEL_OUTPUT_INVALID',
  'API_SELECTION_INVALID',
  'API_BINDING_VALIDATION_FAILED',
  'API_BINDING_CALL_COVERAGE_MISMATCH',
  'API_BINDING_TARGET_OVERLAP',
  'API_BINDING_CYCLE',
  'API_BINDING_GAP_INVALID',
  'NATIVE_NODE_PLANNING_FAILED',
  'WORKFLOW_GRAPH_PLANNING_FAILED',
  'REVIEWABLE_WORKFLOW_GRAPH_PLANNING_FAILED',
  'N8N_COMPILATION_FAILED',
]);

const diagnosticFieldsSchema = z.strictObject({
  owner: z.enum(['core', 'langchain', 'n8n']),
  operation: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/),
  stage: z.enum([
    'input-validation',
    'model-configuration',
    'model-invocation',
    'model-output',
    'contract-validation',
    'planning',
    'compilation',
  ]),
  httpStatus: z.number().int().min(100).max(599).optional(),
});

export const openApiFlowDiagnosticSchema = z.discriminatedUnion('code', [
  diagnosticFieldsSchema.extend({
    code: z.literal('API_BINDING_CALL_COVERAGE_MISMATCH'),
    expectedCount: z.number().int().nonnegative(),
    actualCount: z.number().int().nonnegative(),
    distinctCount: z.number().int().nonnegative(),
  }),
  diagnosticFieldsSchema.extend({
    code: openApiFlowErrorCodeSchema.exclude([
      'API_BINDING_CALL_COVERAGE_MISMATCH',
    ]),
  }),
]);
