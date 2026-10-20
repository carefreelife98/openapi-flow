import { z } from 'zod';
import type { JsonObject } from '../types/openapi.js';
import { listApiRequestInputRoots } from '../arguments/list-api-request-input-roots.js';

/** Only declaration roots are finite; dynamic descendants remain OAS-validated. */
export function createApiRequestInputPointerSchema(requestSchema: JsonObject) {
  const roots = listApiRequestInputRoots(requestSchema);
  if (!roots.length) return z.never();
  const pattern = String.raw`^(?:${roots.map((root) => root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:/[\s\S]*)?$`;
  return z
    .string()
    .regex(new RegExp(pattern))
    .describe(
      'Exact RFC 6901 input pointer of this selected OAS operation. Original OAS validates nested, array and dynamic pointers. Never name another operation input.',
    );
}
