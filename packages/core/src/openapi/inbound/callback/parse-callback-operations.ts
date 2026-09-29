import type { ParsedDocument } from '../../../types/openapi.js';
import type { CallbackOperationSource } from '../../../types/inbound.js';
import {
  operationEntries,
  pointerSegment,
} from '../../common/operation-reference.js';
import { dereferencedObject, object } from '../../common/parse-spec-utils.js';
import { inboundPathItemOperations } from '../inbound-path-item-operations.js';

export function callbackOperationsFromDocument(
  document: ParsedDocument,
): CallbackOperationSource[] {
  const candidates: CallbackOperationSource[] = [];
  for (const [path, rawPathItem] of Object.entries(document.paths)) {
    const pathItem = dereferencedObject(rawPathItem, `spec.paths[${path}]`);
    for (const entry of operationEntries(pathItem)) {
      const parentOperationRef =
        '#/paths/' + pointerSegment(path) + '/' + entry.key;
      const operation = object(
        entry.value,
        `operationRef ${parentOperationRef}`,
      );
      if (operation.callbacks === undefined) continue;
      const callbacks = object(
        operation.callbacks,
        `operationRef ${parentOperationRef}.callbacks`,
      );
      for (const [name, rawCallback] of Object.entries(callbacks)) {
        const callback = dereferencedObject(
          rawCallback,
          `operationRef ${parentOperationRef}.callbacks.${name}`,
        );
        for (const [expression, raw] of Object.entries(callback)) {
          if (expression.startsWith('x-')) continue;
          const pointer =
            parentOperationRef +
            '/callbacks/' +
            pointerSegment(name) +
            '/' +
            pointerSegment(expression);
          const callbackPathItem = dereferencedObject(
            raw,
            `operationRef ${pointer}`,
          );
          candidates.push(
            ...inboundPathItemOperations(
              callbackPathItem,
              expression,
              pointer,
              'callbacks',
              parentOperationRef,
            ),
          );
        }
      }
    }
  }
  return candidates;
}
