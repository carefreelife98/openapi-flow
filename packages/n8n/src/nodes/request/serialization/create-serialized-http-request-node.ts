import type { SerializedHttpRequestNodeInput } from '../../../types/serialized-http-request.js';
import { httpRequestNode } from '../../../legacy/workflow/request/http-request-node.js';

/** File response mode disables n8n JSON transport encoding, so send serialized text. */
export function createSerializedHttpRequestNode(
  input: SerializedHttpRequestNodeInput,
) {
  const request = httpRequestNode(input);
  if (input.body === undefined || input.body.contentType !== 'json')
    return request;
  // JSON Body is itself a JSON-encoded node parameter. n8n parses this envelope
  // into the serializer's wire text, then sends that text with json=false.
  // Keep JSON mode: unlike Raw mode, it also sends DELETE request bodies.
  request.config.parameters = {
    ...request.config.parameters,
    jsonBody:
      input.bodySource === 'literal'
        ? JSON.stringify(input.body.value)
        : '={{ JSON.stringify($json.body.value) }}',
  };
  return request;
}
