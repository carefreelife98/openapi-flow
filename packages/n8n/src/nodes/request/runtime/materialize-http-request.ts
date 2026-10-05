import { materializeApiArguments } from '@openapi-flow/core/runtime';
import type {
  RequestMaterializationConfig,
  ResponseBodies,
  RuntimeHttpRequest,
  RuntimeRequestValidator,
} from '../../../types/request-materialization.js';
import { serializeHttpRequest } from '../serialization/serialize-http-request.js';

/** Shared OAS validators/serializers run on the final values before HTTP sends. */
export function materializeHttpRequest(
  config: RequestMaterializationConfig,
  responses: ResponseBodies,
  validate: RuntimeRequestValidator,
): RuntimeHttpRequest {
  const values = materializeApiArguments(
    config.arguments.values,
    config.arguments.bindings,
    responses,
    {
      callId: config.arguments.callId,
      operation: config.contract,
      requestMediaType: config.arguments.requestMediaType,
    },
  );
  if (!validate(values))
    throw new Error(
      `Runtime request ${config.arguments.callId} does not match the OAS schema: ${JSON.stringify(validate.errors)}`,
    );
  const request = serializeHttpRequest(
    config.operation,
    config.templateUrl,
    values,
    config.arguments.requestMediaType,
  );
  return {
    ...request,
    headersJson: JSON.stringify(
      Object.fromEntries(
        request.headers.map((header) => [header.name, header.value]),
      ),
    ),
  };
}
