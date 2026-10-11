import type { ApiResponseEnvelope } from '@openapi-flow/core';
import type { N8nNodeFragment } from './node-fragment.js';

export interface HttpResponseDecodeInput {
  response: ApiResponseEnvelope;
  bytes: Uint8Array;
  method: string;
  sourceNodeId: string;
}

export interface DecodedHttpResponse {
  response: ApiResponseEnvelope;
  kind: 'json' | 'text' | 'binary' | 'empty';
}

export interface CreateHttpResponseDecoderInput {
  fragment: N8nNodeFragment;
  method: string;
}
