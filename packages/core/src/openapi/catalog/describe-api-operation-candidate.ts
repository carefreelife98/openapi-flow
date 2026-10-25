import type { ApiOperationContract } from '../../types/api-operation.js';
import type { ApiOperationCandidate } from '../../types/api-catalog.js';
import { apiOperationKeySchema } from '../../schemas/api-operation-key-schema.js';
import { apiOperationCandidateSchema } from '../../schemas/api-operation-candidate-schema.js';
import { operationMetadata } from '../common/operation-metadata.js';
import { runOpenApiFlowOperation } from '../../errors/run-openapi-flow-operation.js';

/** Discovery metadata only; request/response/security validation still uses the original contract. */
export function describeApiOperationCandidate(
  input: ApiOperationContract,
): ApiOperationCandidate {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'describeApiOperationCandidate',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const key = apiOperationKeySchema.parse(input.key);
      return apiOperationCandidateSchema.parse({
        key,
        source: input.source,
        operationRef: key.operationRef,
        method: input.method,
        path: input.path,
        ...operationMetadata(input.operation, key.operationRef),
      });
    },
  );
}
