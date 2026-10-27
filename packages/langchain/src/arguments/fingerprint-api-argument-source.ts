import { createHash } from 'node:crypto';
import type { ApiLiteralGenerationInput } from '@openapi-flow/core';
import type { ApiLiteralGenerationOptions } from '../types/argument-generation.js';

/** Only the validated Core snapshot and effective options participate, never a model/client or prior outputs. */
export function fingerprintApiArgumentSource(
  snapshot: ApiLiteralGenerationInput,
  options: ApiLiteralGenerationOptions,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        snapshot,
        includeExplanations: options.includeExplanations === true,
        selectOasEnums: options.selectOasEnums === true,
        trackRequestedInputs: options.trackRequestedInputs === true,
      }),
    )
    .digest('hex');
}
