/** Encode data as a JS string, avoiding n8n's delimiter scan even inside strings. */
export function javascriptJsonLiteral(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined)
    throw new Error('Runtime data must be JSON-serializable');
  const literal = JSON.stringify(json)
    .replaceAll('{', '\\u007b')
    .replaceAll('}', '\\u007d');
  return `JSON.parse(${literal})`;
}
