import { createScanner } from 'jsonc-parser';
import type { ProtectedApiInputLiteral } from '../../types/api-input-source-selection.js';

/** Lexical protection is independent of whether the complete token is valid JSON. */
export function scanProtectedApiInputLiterals(
  reply: string,
): ProtectedApiInputLiteral[] {
  const scanner = createScanner(reply);
  const literals: ProtectedApiInputLiteral[] = [];
  while (scanner.getPosition() < reply.length) {
    scanner.scan();
    const offset = scanner.getTokenOffset();
    const length = scanner.getTokenLength();
    const token = reply.slice(offset, offset + length);
    // Protect complete number-like runs, including malformed JSON forms, so a
    // selected substring cannot silently drop a sign, leading zero or exponent.
    // A decimal point needs following digits; a prose full stop is not numeric.
    // Only token spans change here. The original selected text is parsed later.
    const numeric = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d*)?/u.exec(
      reply.slice(offset),
    );
    if (numeric) {
      literals.push({ offset, length: numeric[0].length, quoted: false });
      scanner.setPosition(offset + numeric[0].length);
      continue;
    }
    // jsonc-parser treats a keyword followed by prose punctuation as one unknown
    // token. Preserve the JSON keyword boundary without matching ASCII names
    // such as falsehood or null_value.
    const keyword = /^(?:true|false|null)(?![A-Za-z0-9_$])/u.exec(
      reply.slice(offset),
    );
    if (keyword) {
      literals.push({ offset, length: keyword[0].length, quoted: false });
      scanner.setPosition(offset + keyword[0].length);
      continue;
    }
    if (
      token.startsWith('"') ||
      token === 'true' ||
      token === 'false' ||
      token === 'null'
    )
      literals.push({ offset, length, quoted: token.startsWith('"') });
  }
  return literals;
}
