import type {
  InboundOperationCandidate,
  InboundOperationSource,
  JsonObject,
  ParsedDocument,
} from '../types/openapi.js';
import { operationMetadata } from './operation-metadata.js';
import { operationEntries, pointerSegment } from './operation-reference.js';
import { dereferencedObject, object } from './parse-spec-utils.js';
import { validatedDocument } from './validate-spec.js';

function addPathItemOperations(
  candidates: InboundOperationSource[],
  pathItem: JsonObject,
  path: string,
  pointer: string,
  source: InboundOperationCandidate['source'],
  parentOperationRef?: string,
): void {
  for (const entry of operationEntries(pathItem)) {
    const operationRef = pointer + '/' + entry.key;
    const operation = object(entry.value, `operationRef ${operationRef}`);
    candidates.push({
      candidate: {
        operationRef,
        source,
        ...operationMetadata(operation, `operationRef ${operationRef}`),
        method: entry.method,
        path,
        ...(parentOperationRef === undefined ? {} : { parentOperationRef }),
      },
      operation,
    });
  }
}

export function inboundOperationSourcesFromDocument(
  document: ParsedDocument,
): InboundOperationSource[] {
  const candidates: InboundOperationSource[] = [];
  if (document.spec.webhooks !== undefined) {
    const webhooks = object(document.spec.webhooks, 'spec.webhooks');
    for (const [name, raw] of Object.entries(webhooks)) {
      const pointer = '#/webhooks/' + pointerSegment(name);
      const pathItem = dereferencedObject(raw, `spec.webhooks[${name}]`);
      addPathItemOperations(candidates, pathItem, name, pointer, 'webhooks');
    }
  }
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
          addPathItemOperations(
            candidates,
            callbackPathItem,
            expression,
            pointer,
            'callbacks',
            parentOperationRef,
          );
        }
      }
    }
  }
  return candidates;
}

export async function inboundOperationsFromSpec(
  input: unknown,
): Promise<InboundOperationCandidate[]> {
  const document = await validatedDocument(input);
  return inboundOperationSourcesFromDocument(document).map(
    (source) => source.candidate,
  );
}
