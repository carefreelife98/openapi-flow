import { parseTree } from 'jsonc-parser';
import type { ParseError } from 'jsonc-parser';
import type {
  ApiInputSourceCatalog,
  ApiInputTextSourceToken,
} from '../../types/api-input-source-selection.js';
import type { ApiInputAnswerSourceLocation } from '../../types/api-input-answer-extraction.js';
import { scanProtectedApiInputLiterals } from './scan-protected-api-input-literals.js';

/** Enumerate original literal spans and unquoted boundaries, never proposed values. */
export function describeApiInputSources(reply: string): ApiInputSourceCatalog {
  if (typeof reply !== 'string')
    throw new Error('API input sources require reply to be a string');
  const protectedLiterals = scanProtectedApiInputLiterals(reply);
  const literals = new Map(
    protectedLiterals.map((literal) => [literal.offset, literal]),
  );
  const candidates: ApiInputAnswerSourceLocation[] = [...protectedLiterals];
  const stack: ApiInputAnswerSourceLocation[] = [];
  const catalog: ApiInputSourceCatalog = { json: [], text: [] };
  let textTokens: ApiInputTextSourceToken[] = [];
  const flushText = () => {
    if (textTokens.length)
      catalog.text.push({
        id: `text:${textTokens[0].offset}`,
        tokens: textTokens,
      });
    textTokens = [];
  };
  for (let offset = 0; offset < reply.length;) {
    const literal = literals.get(offset);
    if (literal?.quoted) {
      flushText();
      offset += literal.length;
      continue;
    }
    const character = String.fromCodePoint(reply.codePointAt(offset)!);
    const length = literal?.length ?? character.length;
    if (!literal && (character === '{' || character === '['))
      stack.push({ offset, length: 1 });
    if (!literal && (character === '}' || character === ']')) {
      const start = stack.pop();
      if (
        start !== undefined &&
        ((reply[start.offset] === '{' && character === '}') ||
          (reply[start.offset] === '[' && character === ']'))
      )
        candidates.push({
          offset: start.offset,
          length: offset + 1 - start.offset,
        });
      else stack.length = 0;
    }
    textTokens.push({
      id: `text:${offset}:${length}`,
      text: reply.slice(offset, offset + length),
      offset,
      length,
    });
    offset += length;
  }
  flushText();
  for (const candidate of candidates.sort(
    (a, b) => a.offset - b.offset || b.length - a.length,
  )) {
    const text = reply.slice(
      candidate.offset,
      candidate.offset + candidate.length,
    );
    // A malformed numeric run or quoted token is protected, not a valid JSON
    // choice. Absence is not repaired into a smaller literal or a different type.
    const errors: ParseError[] = [];
    const parsed = parseTree(text, errors, {
      allowTrailingComma: false,
      disallowComments: true,
    });
    if (!parsed || errors.length) continue;
    const pending = [parsed];
    let finite = true;
    while (pending.length) {
      const node = pending.pop()!;
      if (node.type === 'number' && !Number.isFinite(node.value))
        finite = false;
      if (node.children) pending.push(...node.children);
    }
    if (!finite) continue;
    catalog.json.push({
      id: `json:${candidate.offset}:${candidate.length}`,
      text,
      offset: candidate.offset,
      length: candidate.length,
    });
  }
  return catalog;
}
