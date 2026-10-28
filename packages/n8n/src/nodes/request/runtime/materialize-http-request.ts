import {
  materializeApiArguments,
  assignRequestInputValue,
  listMissingRequestedApiInputs,
} from '@openapi-flow/core/runtime';
import type {
  DeferredApiInputValues,
  ApiArgumentValues,
} from '@openapi-flow/core';
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
  inputValues?: DeferredApiInputValues,
): RuntimeHttpRequest {
  let literals = JSON.parse(
    JSON.stringify(config.arguments.values),
  ) as ApiArgumentValues;
  for (const slot of config.deferredInputs?.slots ?? []) {
    if (!inputValues || !Object.hasOwn(inputValues, slot.id))
      throw new Error(
        `Missing runtime input ${slot.id} for ${slot.callId}${slot.targetPointer}`,
      );
    literals = assignRequestInputValue(
      literals,
      slot.targetPointer,
      inputValues[slot.id],
      {
        callId: config.arguments.callId,
        operation: config.contract,
        requestMediaType: config.arguments.requestMediaType,
      },
    );
  }
  const values = materializeApiArguments(
    literals,
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
  const missing = listMissingRequestedApiInputs({
    source: `Runtime request ${config.arguments.callId}`,
    rootPointer: '',
    value: values,
    requestedInputs: config.arguments.requestedInputs,
  });
  if (missing.length)
    throw new Error(
      `Runtime request ${config.arguments.callId} omits scenario-requested inputs: ${missing.join(', ')}`,
    );
  const request = serializeHttpRequest(
    config.operation,
    config.templateUrl,
    values,
    config.arguments.requestMediaType,
    config.pagination,
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
