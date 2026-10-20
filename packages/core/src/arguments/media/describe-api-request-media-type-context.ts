import type {
  ApiRequestMediaTypeContext,
  ApiRequestMediaTypeContextInput,
} from '../../types/api-request-media-type-decision.js';
import { apiRequestMediaTypeContextSchema } from '../../schemas/api-request-media-type-decision-schema.js';
import { listApiRequestMediaTypes } from './list-api-request-media-types.js';
import { object } from '../../openapi/common/parse-spec-utils.js';

/** A copy of exactly the selected contract material supplied to the format model. */
export function describeApiRequestMediaTypeContext(
  input: ApiRequestMediaTypeContextInput,
): ApiRequestMediaTypeContext {
  const operation = input.operation;
  const mediaTypes = listApiRequestMediaTypes(operation);
  const requestBody = operation.operation.requestBody;
  const context = apiRequestMediaTypeContextSchema.parse({
    scenario: input.scenario,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    operation: {
      key: operation.key,
      method: operation.method,
      path: operation.path,
      ...(requestBody === undefined
        ? {}
        : {
            requestBody: object(
              requestBody,
              `${operation.key.operationRef}.requestBody`,
            ),
          }),
    },
    mediaTypes,
  });
  if (requestBody !== undefined && mediaTypes.length === 0)
    throw new Error(
      `${operation.key.operationRef}.requestBody.content has no request media type`,
    );
  // Arbitrary nested OAS schema data must be copied too, not retained through z.unknown().
  return structuredClone(context);
}
