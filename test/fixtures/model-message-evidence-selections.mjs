/** Encode canonical fixture evidence as the model's ID-only wire contract. Never used by production code. */
export function modelMessageEvidenceSelections(value) {
  if (Array.isArray(value)) {
    const encoded = value.map(modelMessageEvidenceSelections);
    return encoded.every((child, index) => child === value[index])
      ? value
      : encoded;
  }
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value).map(([key, child]) => [
    key,
    (key === 'sources' || key === 'evidence') && Array.isArray(child)
      ? child.map((evidence) =>
          evidence.kind === 'message'
            ? Object.hasOwn(evidence, 'quote')
              ? { kind: evidence.kind, messageId: evidence.messageId }
              : evidence
            : modelMessageEvidenceSelections(evidence),
        )
      : key === 'value' || key === 'parameters'
        ? child
        : modelMessageEvidenceSelections(child),
  ]);
  return entries.every(([key, child]) => child === value[key])
    ? value
    : Object.fromEntries(entries);
}
