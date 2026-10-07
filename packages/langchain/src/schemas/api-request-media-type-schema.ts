import { z } from 'zod';
import type { ApiRequestMediaTypeOutput } from '../types/request-media-selection.js';

export function createApiRequestMediaTypeSchema(
  mediaTypes: string[],
): z.ZodType<ApiRequestMediaTypeOutput> {
  if (mediaTypes.length < 2)
    throw new Error(
      'request media selection requires multiple declared media types',
    );
  return z.strictObject({
    requestMediaType: z
      .enum(mediaTypes)
      .nullable()
      .describe(
        'Exact OAS requestBody.content key matching an explicitly requested format, or null when the scenario leaves the format unspecified or ambiguous so code can apply the documented default. This is the request Content-Type, not the response format.',
      ),
  });
}
