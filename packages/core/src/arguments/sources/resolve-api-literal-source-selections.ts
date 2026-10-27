import type {
  ApiLiteralProposalSource,
  ResolveApiLiteralSourceSelectionsInput,
  VerifiedApiLiteralProposalSource,
} from '../../types/api-input-literal-source.js';
import { pointerValue } from '../../bindings/json-pointer.js';
import { apiLiteralSourceSelectionsSchema } from '../../schemas/api-literal-source-selection-schema.js';
import { describeApiLiteralJsonSources } from './describe-api-literal-json-sources.js';
import { resolveApiLiteralProposalSources } from './resolve-api-literal-proposal-sources.js';

/** Source text is code-owned: an exact proposed string or a selected original JSON token. */
export function resolveApiLiteralSourceSelections(
  input: ResolveApiLiteralSourceSelectionsInput,
): VerifiedApiLiteralProposalSource[] {
  const selections = apiLiteralSourceSelectionsSchema.parse(input.selections);
  const catalog = describeApiLiteralJsonSources(input.messages);
  const sources: ApiLiteralProposalSource[] = selections.map((selection) => {
    const message = catalog.find(
      (item) => item.messageId === selection.messageId,
    );
    if (message === undefined)
      throw new Error(
        `API ${input.callId} literal ${selection.targetPointer} cites unavailable user message ${selection.messageId}`,
      );
    const identity = {
      targetPointer: selection.targetPointer,
      messageId: selection.messageId,
    };
    if (selection.sourceFormat === 'text') {
      const value = pointerValue(input.values, selection.targetPointer);
      if (typeof value !== 'string' || value.length === 0)
        throw new Error(
          `API ${input.callId} literal ${selection.targetPointer} text source requires a nonempty proposed string; an explicit empty string needs an original JSON token`,
        );
      return { ...identity, sourceFormat: 'text', sourceText: value };
    }
    const candidate = message.json.find(
      (item) => item.id === selection.candidateId,
    );
    if (candidate === undefined)
      throw new Error(
        `API ${input.callId} literal ${selection.targetPointer} has unknown or stale original JSON candidate ${selection.candidateId}`,
      );
    return { ...identity, sourceFormat: 'json', sourceText: candidate.text };
  });
  return resolveApiLiteralProposalSources({
    callId: input.callId,
    values: input.values,
    messages: input.messages,
    sources,
  });
}
