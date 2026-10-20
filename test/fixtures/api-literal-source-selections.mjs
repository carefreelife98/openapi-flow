/** Unit-model proposals select sources; callers must supply the actual text separately. */
export function apiLiteralSourceSelections(values, messageId) {
  const sources = [];
  function visit(value, targetPointer) {
    if (
      value !== null &&
      typeof value === 'object' &&
      Object.keys(value).length
    ) {
      for (const [key, child] of Object.entries(value))
        visit(
          child,
          `${targetPointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`,
        );
    } else {
      sources.push({
        targetPointer,
        messageId,
        sourceFormat: 'json',
        sourceText: JSON.stringify(value),
      });
    }
  }
  for (const [key, value] of Object.entries(values)) visit(value, `/${key}`);
  return sources;
}

export function apiLiteralSourcesFromMessages(values, messages) {
  return apiLiteralSourceSelections(values, 'unselected').map((source) => {
    const message = messages.find((entry) =>
      entry.text.includes(source.sourceText),
    );
    if (!message)
      throw new Error(
        `Unit fixture has no explicit text for ${source.targetPointer}`,
      );
    return { ...source, messageId: message.id };
  });
}
