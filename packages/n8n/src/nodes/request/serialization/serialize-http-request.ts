import {
  serializePathParameter,
  serializeQueryParameter,
  serializeHeaderParameter,
  serializeCookieParameter,
  serializeFormBody,
  UnsupportedOperationError,
} from '@openapi-flow/core/runtime';
import type { ApiArgumentValues } from '@openapi-flow/core';
import type { Operation } from '@openapi-flow/core/internal';
import type { MaterializedHttpRequest } from '../../../types/request-materialization.js';
import type { JsonObject } from '@openapi-flow/core/internal';
import { looksLikeCredential } from '../authentication/credential-field-name.js';

/** Pure transport mapping, shared by literal and runtime-bound requests. */
export function serializeHttpRequest(
  operation: Operation,
  templateUrl: string,
  values: ApiArgumentValues,
  requestMediaType?: string,
): MaterializedHttpRequest {
  let url = templateUrl;
  const query: string[] = [];
  const headers: MaterializedHttpRequest['headers'] = [];
  const cookies: string[] = [];
  for (const parameter of operation.parameters) {
    const value = values[parameter.in]?.[parameter.name];
    if (value === undefined) continue;
    switch (parameter.in) {
      case 'path':
        url = url.replace(
          encodeURIComponent('{' + parameter.name + '}'),
          serializePathParameter(parameter, operation.operationRef, value),
        );
        break;
      case 'query':
        query.push(
          ...serializeQueryParameter(parameter, operation.operationRef, value),
        );
        break;
      case 'header':
        headers.push({
          name: parameter.name,
          value: serializeHeaderParameter(
            parameter,
            operation.operationRef,
            value,
          ),
        });
        break;
      case 'cookie':
        cookies.push(
          ...serializeCookieParameter(parameter, operation.operationRef, value),
        );
        break;
    }
  }
  if (query.length) url += '?' + query.join('&');
  if (cookies.length)
    headers.push({ name: 'Cookie', value: cookies.join('; ') });
  if (values.body === undefined) return { url, headers };
  if (!operation.body)
    throw new Error(`${operation.operationRef} has no request body`);
  const declared = Object.keys(operation.body.mediaTypes);
  const mediaType =
    requestMediaType ?? (declared.length === 1 ? declared[0] : undefined);
  if (!mediaType || !Object.hasOwn(operation.body.mediaTypes, mediaType))
    throw new Error(
      `${operation.operationRef}: requestMediaType must select a declared body media type`,
    );
  if (
    values.body !== null &&
    typeof values.body === 'object' &&
    !Array.isArray(values.body)
  )
    for (const name of Object.keys(values.body))
      if (looksLikeCredential(name))
        throw new Error(
          `body.${name} looks like a credential; use credentialBindings`,
        );
  if (mediaType === 'application/json')
    return {
      url,
      headers,
      body: { contentType: 'json', value: JSON.stringify(values.body) },
    };
  if (mediaType !== 'application/x-www-form-urlencoded')
    throw new UnsupportedOperationError(
      operation.operationRef,
      `requestBody media type ${mediaType} has no n8n mapping`,
    );
  if (
    !values.body ||
    typeof values.body !== 'object' ||
    Array.isArray(values.body)
  )
    throw new Error('form-urlencoded body must be an object');
  return {
    url,
    headers,
    body: {
      contentType: 'form-urlencoded',
      value: serializeFormBody(
        operation.operationRef,
        operation.body.mediaTypes[mediaType],
        values.body as JsonObject,
      ),
    },
  };
}
