import assert from 'node:assert/strict';

export function jsonInputSource(payload, text) {
  const candidate = payload.sources.json.find((item) => item.text === text);
  assert.ok(candidate, `Fixture requires exact JSON candidate ${text}`);
  return { kind: 'json', candidateId: candidate.id };
}

export function textInputSource(payload, text) {
  for (const segment of payload.sources.text) {
    for (let start = 0; start < segment.tokens.length; start++) {
      let value = '';
      for (let end = start; end < segment.tokens.length; end++) {
        value += segment.tokens[end].text;
        if (value === text)
          return {
            kind: 'text',
            startTokenId: segment.tokens[start].id,
            endTokenId: segment.tokens[end].id,
          };
      }
    }
  }
  throw new Error(`Fixture requires an exact unquoted text span ${text}`);
}
