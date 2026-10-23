import type { ApiInputAnswerSource } from '../../../types/api-input-answer-extraction.js';
import type { ResolveApiInputSourceSelectionsInput } from '../../../types/api-input-source-selection.js';
import { apiInputAnswerSelectionsSchema } from '../../../schemas/api-input-source-selection-schema.js';
import { captureApiInputAnswerContext } from './capture-api-input-answer-context.js';
import { describeApiInputSources } from '../../sources/describe-api-input-sources.js';

/** Resolve IDs against a fresh original-reply inventory, not model-provided text. */
export function resolveApiInputSourceSelections(
  input: ResolveApiInputSourceSelectionsInput,
): ApiInputAnswerSource[] {
  const context = captureApiInputAnswerContext({
    reply: input.reply,
    requirements: input.requirements,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
  });
  const catalog = describeApiInputSources(context.reply);
  const selections = apiInputAnswerSelectionsSchema.parse(input.selections);
  const answered = new Set<string>();
  return selections.map((selection) => {
    if (
      !context.requirements.some(
        (requirement) => requirement.id === selection.requirementId,
      ) ||
      answered.has(selection.requirementId)
    )
      throw new Error(
        `Unknown or duplicate requirementId: ${selection.requirementId}`,
      );
    answered.add(selection.requirementId);
    const source = selection.source;
    if (source.kind === 'json') {
      const candidate = catalog.json.find(
        (item) => item.id === source.candidateId,
      );
      if (!candidate)
        throw new Error(
          `Answer ${selection.requirementId} has an unknown JSON source candidate: ${source.candidateId}`,
        );
      return {
        requirementId: selection.requirementId,
        sourceFormat: 'json',
        sourceText: candidate.text,
      };
    }
    const segment = catalog.text.find((item) =>
      item.tokens.some((token) => token.id === source.startTokenId),
    );
    const start = segment?.tokens.findIndex(
      (token) => token.id === source.startTokenId,
    );
    const end = segment?.tokens.findIndex(
      (token) => token.id === source.endTokenId,
    );
    if (
      !segment ||
      start === undefined ||
      end === undefined ||
      start < 0 ||
      end < start
    )
      throw new Error(
        `Answer ${selection.requirementId} requires ordered text boundaries in one original unquoted segment`,
      );
    const first = segment.tokens[start];
    const last = segment.tokens[end];
    return {
      requirementId: selection.requirementId,
      sourceFormat: 'text',
      sourceText: context.reply.slice(first.offset, last.offset + last.length),
    };
  });
}
