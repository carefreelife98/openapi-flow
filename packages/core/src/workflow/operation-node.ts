import { node } from '@n8n/workflow-sdk';
import { UnsupportedOperationError } from '../openapi/unsupported-operation-error.js';
import type { OperationNodeInput } from '../types/workflow.js';

// n8n HTTP Request V3, node version 4.3 (verified against n8n 2.37.10).
const httpRequestMethods = new Set([
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
]);

export function operationNode({
  operation,
  id,
  name,
  position,
  url,
  body,
  headers,
  authentication,
  shouldAssert,
}: OperationNodeInput) {
  if (operation.source !== 'paths') {
    throw new Error(
      `operationRef ${operation.operationRef} is not an outgoing path request`,
    );
  }
  if (!httpRequestMethods.has(operation.method)) {
    throw new UnsupportedOperationError(
      operation.operationRef,
      `operationRef ${operation.operationRef} uses HTTP method ${operation.method}, which n8n HTTP Request node v4.3 does not expose`,
    );
  }
  if (body !== undefined && ['HEAD', 'OPTIONS'].includes(operation.method)) {
    throw new UnsupportedOperationError(
      operation.operationRef,
      `operationRef ${operation.operationRef} has a request body that n8n HTTP Request node v4.3 does not send for ${operation.method}`,
    );
  }
  return node({
    type: 'n8n-nodes-base.httpRequest',
    version: 4.3,
    config: {
      id,
      name,
      position,
      parameters: {
        method: operation.method,
        url,
        ...authentication?.parameters,
        ...(headers.length
          ? {
              sendHeaders: true,
              specifyHeaders: 'keypair',
              headerParameters: { parameters: headers },
            }
          : {}),
        ...(body === undefined
          ? {}
          : body.contentType === 'json'
            ? {
                sendBody: true,
                contentType: 'json',
                specifyBody: 'json',
                jsonBody: body.value,
              }
            : {
                sendBody: true,
                contentType: 'form-urlencoded',
                specifyBody: 'string',
                body: body.value,
              }),
        options: {
          response: {
            response: {
              fullResponse: true,
              ...(shouldAssert ? { neverError: true } : {}),
              responseFormat: 'autodetect',
            },
          },
        },
      },
      ...(authentication ? { credentials: authentication.credentials } : {}),
    },
  });
}
