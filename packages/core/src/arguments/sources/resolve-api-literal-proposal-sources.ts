import type { JsonValue } from '../../types/api-arguments.js';
import type {
  ResolveApiLiteralProposalSourcesInput,
  VerifiedApiLiteralProposalSource,
} from '../../types/api-input-literal-source.js';
import { pointerTokens, pointerValue } from '../../bindings/json-pointer.js';
import { verifyApiInputLiteralSource } from './verify-api-input-literal-source.js';

/** The same source/coverage checks serve independent generation and draft editing. */
export function resolveApiLiteralProposalSources(
  input: ResolveApiLiteralProposalSourcesInput,
): VerifiedApiLiteralProposalSource[] {
  if (
    !input.callId?.trim() ||
    !Array.isArray(input.sources) ||
    !Array.isArray(input.messages)
  )
    throw new Error(
      'Literal sources require callId, sources and original messages',
    );
  const sources: VerifiedApiLiteralProposalSource[] = [];
  for (const selection of input.sources) {
    pointerTokens(selection.targetPointer);
    const label = `API ${input.callId} literal ${selection.targetPointer}`;
    if (
      sources.some((source) =>
        overlaps(source.targetPointer, selection.targetPointer),
      )
    )
      throw new Error(`${label} has duplicate or overlapping literalSources`);
    const message = input.messages.find(
      (entry) => entry.id === selection.messageId,
    );
    if (!message)
      throw new Error(
        `${label} cites unavailable user message ${selection.messageId}`,
      );
    const proposed = pointerValue(input.values, selection.targetPointer);
    if (proposed === undefined)
      throw new Error(`${label} source targets an absent proposed value`);
    const parsed = verifyApiInputLiteralSource({
      ...selection,
      text: message.text,
      label,
      value: proposed as JsonValue,
    });
    sources.push({ ...selection, occurrences: parsed.occurrences });
  }
  function check(value: JsonValue, pointer: string): void {
    if (sources.some((source) => isAncestor(source.targetPointer, pointer)))
      return;
    if (
      value !== null &&
      typeof value === 'object' &&
      Object.keys(value).length
    ) {
      for (const [key, child] of Object.entries(value))
        check(
          child,
          `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`,
        );
      return;
    }
    throw new Error(
      `API ${input.callId} literal ${pointer} requires an exact user source in literalSources`,
    );
  }
  for (const [root, value] of Object.entries(input.values)) {
    if (
      root !== 'body' &&
      value !== null &&
      typeof value === 'object' &&
      !Object.keys(value).length
    )
      continue;
    check(value, `/${root}`);
  }
  return sources;
}

function isAncestor(ancestor: string, pointer: string): boolean {
  return (
    ancestor === '' ||
    pointer === ancestor ||
    pointer.startsWith(`${ancestor}/`)
  );
}

function overlaps(left: string, right: string): boolean {
  return isAncestor(left, right) || isAncestor(right, left);
}
