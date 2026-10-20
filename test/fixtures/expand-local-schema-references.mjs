/** Test-only structural inspection. Wire schemas are still validated/sent unchanged. */
export function expandLocalSchemaReferences(schema) {
  function expand(value, active = new Set()) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value))
      return value.map((entry) => expand(entry, active));
    if (typeof value.$ref === 'string') {
      if (!value.$ref.startsWith('#/'))
        throw new Error(
          `Structural inspection requires a local reference: ${value.$ref}`,
        );
      if (Object.keys(value).length !== 1)
        throw new Error(
          `Structural inspection refuses reference siblings: ${value.$ref}`,
        );
      if (active.has(value.$ref)) return { ...value };
      let target = schema;
      for (const key of value.$ref
        .slice(2)
        .split('/')
        .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
        if (
          !target ||
          typeof target !== 'object' ||
          !Object.hasOwn(target, key)
        )
          throw new Error(
            `Structural inspection found a dangling reference: ${value.$ref}`,
          );
        target = target[key];
      }
      return expand(target, new Set([...active, value.$ref]));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, expand(child, active)]),
    );
  }
  return expand(schema);
}
