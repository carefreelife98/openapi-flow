import type { JsonValue } from '../../types/api-arguments.js';
import type {
  ReadApiInputLiteralSourceInput,
  ReadApiInputLiteralSourceResult,
} from '../../types/api-input-literal-source.js';
import { locateCompleteApiInputSource } from './locate-complete-api-input-source.js';

/** Exact source occurrence and literal parsing, never semantic conversion or repair. */
export function readApiInputLiteralSource(
  input: ReadApiInputLiteralSourceInput,
): ReadApiInputLiteralSourceResult {
  const occurrences = locateCompleteApiInputSource(
    input.text,
    input.sourceText,
  );
  if (!occurrences.length)
    throw new Error(
      `${input.label} sourceText is absent or is not a complete literal in the user reply`,
    );
  if (input.sourceFormat === 'text')
    return { value: input.sourceText, occurrences };
  try {
    const value = JSON.parse(input.sourceText, (_key, part: unknown) => {
      if (typeof part === 'number' && !Number.isFinite(part))
        throw new Error(
          'JSON number is outside the finite JavaScript number range',
        );
      return part;
    }) as JsonValue;
    return { value, occurrences };
  } catch (cause) {
    throw new Error(
      `${input.label} sourceText is not a complete JSON literal`,
      { cause },
    );
  }
}
