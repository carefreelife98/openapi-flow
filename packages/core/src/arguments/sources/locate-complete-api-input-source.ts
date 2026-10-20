import type { ApiInputAnswerSourceLocation } from '../../types/api-input-answer-extraction.js';
import { scanProtectedApiInputLiterals } from './scan-protected-api-input-literals.js';

/** The scanner checks token boundaries only. It never parses or repairs a value. */
export function locateCompleteApiInputSource(
  reply: string,
  sourceText: string,
): ApiInputAnswerSourceLocation[] {
  const literals = scanProtectedApiInputLiterals(reply);
  const occurrences: ApiInputAnswerSourceLocation[] = [];
  for (
    let offset = reply.indexOf(sourceText);
    offset !== -1;
    offset = reply.indexOf(sourceText, offset + 1)
  ) {
    const end = offset + sourceText.length;
    if (
      literals.every((literal) => {
        const literalEnd = literal.offset + literal.length;
        return (
          end <= literal.offset ||
          offset >= literalEnd ||
          (offset <= literal.offset && end >= literalEnd)
        );
      })
    )
      occurrences.push({ offset, length: sourceText.length });
  }
  return occurrences;
}
