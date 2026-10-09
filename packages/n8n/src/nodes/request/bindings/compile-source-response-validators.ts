import { createApiResponseSchema } from '@openapi-flow/core';
import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import { compileStandaloneValidator } from '../../common/validation/compile-standalone-validator.js';

export function compileSourceResponseValidators(
  sources: N8nOutputBindingSource[],
): string {
  return sources
    .map((source, index) =>
      source.kind === 'api-response' && source.operation
        ? compileStandaloneValidator({
            schema: createApiResponseSchema({ operation: source.operation }),
            globalName: `OpenApiFlowResponseValidator${index}`,
          })
        : '',
    )
    .join('\n');
}
