import { apiResponseValidationValue } from '@openapi-flow/core/runtime';
import type {
  DecodedHttpResponse,
  HttpResponseDecodeInput,
} from '../../../types/http-response-decoding.js';
import {
  isBinaryResponseMedia,
  isJsonResponseMedia,
} from './http-response-media.js';

/** Decode raw transport bytes once; never guess or repair an already parsed value. */
export function decodeHttpResponse({
  response,
  bytes,
  method,
  sourceNodeId,
}: HttpResponseDecodeInput): DecodedHttpResponse {
  const observed = apiResponseValidationValue(response);
  if (Object.hasOwn(response, 'body'))
    throw new Error(
      `API ${sourceNodeId} raw File transport must not contain body`,
    );
  if (
    bytes.byteLength === 0 &&
    (method === 'HEAD' ||
      observed.statusCode === 204 ||
      observed.statusCode === 304)
  )
    return { response: { ...response }, kind: 'empty' };
  if (isBinaryResponseMedia(observed.mediaType))
    return { response: { ...response }, kind: 'binary' };

  const json = isJsonResponseMedia(observed.mediaType);
  const contentType = Object.entries(response.headers).find(
    ([name]) => name.toLowerCase() === 'content-type',
  )?.[1];
  const charset =
    typeof contentType === 'string'
      ? /;\s*charset\s*=\s*(?:"([^"]*)"|([^;\s]*))/i.exec(contentType)
      : null;
  // JSON uses UTF-8 (RFC 8259 §8.1). Text retains the native UTF-8 codec default
  // unless the actual HTTP header explicitly declares another charset.
  const encoding =
    json || charset === null ? 'utf-8' : (charset[1] ?? charset[2]);
  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch (cause) {
    throw new Error(`API ${sourceNodeId} has invalid HTTP response encoding`, {
      cause,
    });
  }
  if (!json) return { response: { ...response, body: text }, kind: 'text' };
  try {
    return { response: { ...response, body: JSON.parse(text) }, kind: 'json' };
  } catch (cause) {
    throw new Error(`API ${sourceNodeId} has an invalid JSON HTTP response`, {
      cause,
    });
  }
}
