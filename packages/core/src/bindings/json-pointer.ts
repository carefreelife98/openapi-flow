export function pointerTokens(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer))
    throw new Error(`Invalid JSON Pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}

export function pointerValue(value: unknown, pointer: string): unknown {
  let result = value;
  for (const token of pointerTokens(pointer)) {
    if (
      result === null ||
      typeof result !== 'object' ||
      !Object.hasOwn(result, token)
    )
      return undefined;
    result = Reflect.get(result, token);
  }
  return result;
}

export function hasPointer(value: unknown, pointer: string): boolean {
  return pointerValue(value, pointer) !== undefined;
}
