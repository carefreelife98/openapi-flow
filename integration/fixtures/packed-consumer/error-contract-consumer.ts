import assert from 'node:assert/strict';
import {
  OpenApiFlowError,
  isOpenApiFlowError,
  openApiFlowDiagnosticSchema,
} from '@openapi-flow/core/errors';
import type {
  OpenApiFlowDiagnostic,
  OpenApiFlowErrorCode,
} from '@openapi-flow/core/errors';

const code: OpenApiFlowErrorCode = 'API_BINDING_CALL_COVERAGE_MISMATCH';
const diagnostic: OpenApiFlowDiagnostic = {
  code,
  owner: 'core',
  operation: 'validateApiBindingAssignments',
  stage: 'contract-validation',
  expectedCount: 2,
  actualCount: 1,
  distinctCount: 1,
};
const cause = new Error('consumer-private-cause');
const error: unknown = new OpenApiFlowError({
  message: 'consumer-private-message',
  diagnostic,
  cause,
});
assert.ok(isOpenApiFlowError(error));
assert.equal(error.cause, cause);
assert.deepEqual(
  openApiFlowDiagnosticSchema.parse(JSON.parse(JSON.stringify(error))),
  diagnostic,
);
assert.equal(JSON.stringify(error).includes('consumer-private'), false);
if (error.diagnostic.code === 'API_BINDING_CALL_COVERAGE_MISMATCH') {
  const expectedCount: number = error.diagnostic.expectedCount;
  assert.equal(expectedCount, 2);
}
