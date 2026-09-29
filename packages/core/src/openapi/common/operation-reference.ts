import type { OperationEntry } from '../../types/openapi.js';

const methods = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
  'query',
] as const;

export function pointerSegment(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function operationEntries(
  pathItem: Record<string, unknown>,
): OperationEntry[] {
  const entries: OperationEntry[] = methods.flatMap((method) =>
    pathItem[method] === undefined
      ? []
      : [
          {
            method: method.toUpperCase(),
            key: method,
            value: pathItem[method],
          },
        ],
  );
  const additional = pathItem.additionalOperations;
  if (
    additional &&
    typeof additional === 'object' &&
    !Array.isArray(additional)
  ) {
    for (const [method, value] of Object.entries(additional)) {
      entries.push({
        method,
        key: 'additionalOperations/' + pointerSegment(method),
        value,
      });
    }
  }
  return entries;
}
