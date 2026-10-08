import { createApiRequestSchema } from '@openapi-flow/core';
import type { RequestMaterializationConfig } from '../../../types/request-materialization.js';
import { compileStandaloneValidator } from '../../common/validation/compile-standalone-validator.js';

/** Compile OAS schemas on the host; n8n receives no schema compiler/eval. */
export function compileRequestValidator(
  config: RequestMaterializationConfig,
): string {
  const schema = createApiRequestSchema({
    operation: config.contract,
    requestMediaType: config.arguments.requestMediaType,
  });
  return compileStandaloneValidator({
    schema,
    globalName: 'OpenApiFlowRequestValidator',
  });
}
