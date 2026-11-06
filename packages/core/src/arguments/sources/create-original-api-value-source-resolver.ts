import { isDeepStrictEqual } from 'node:util';
import type { JsonValue } from '../../types/api-arguments.js';
import type { WorkflowSourceMessage } from '../../types/workflow-draft.js';
import type { OriginalApiValueSourceResolver } from '../../types/original-api-value-source.js';
import { describeApiInputJsonSources } from './describe-api-input-sources.js';
import { locateCompleteApiInputSource } from './locate-complete-api-input-source.js';

/** A value-only proposal gets code-derived attribution; no model-owned message or position. */
export function createOriginalApiValueSourceResolver(
  messages: WorkflowSourceMessage[],
): OriginalApiValueSourceResolver {
  const originals = messages.map((message) => ({
    message,
    json: describeApiInputJsonSources(message.text).map((candidate) => ({
      ...candidate,
      value: JSON.parse(candidate.text) as JsonValue,
    })),
  }));
  return (value) => {
    for (const original of originals) {
      const candidate = original.json.find((candidate) =>
        isDeepStrictEqual(candidate.value, value),
      );
      if (candidate !== undefined)
        return {
          messageId: original.message.id,
          sourceFormat: 'json',
          sourceText: candidate.text,
          occurrences: locateCompleteApiInputSource(
            original.message.text,
            candidate.text,
          ),
        };
    }
    if (typeof value !== 'string' || !value.length) return undefined;
    for (const original of originals) {
      const occurrences = locateCompleteApiInputSource(
        original.message.text,
        value,
      ).filter(
        (location) =>
          !original.json.some(
            (candidate) =>
              candidate.value !== null &&
              typeof candidate.value === 'object' &&
              location.offset >= candidate.offset &&
              location.offset + location.length <=
                candidate.offset + candidate.length,
          ),
      );
      if (occurrences.length)
        return {
          messageId: original.message.id,
          sourceText: value,
          sourceFormat: 'text',
          occurrences,
        };
    }
    return undefined;
  };
}
