import type { JsonObject } from '../../types/openapi.js';
import type {
  CallbackOperationSource,
  InboundOperationSource,
  WebhookOperationSource,
} from '../../types/inbound.js';
import { operationMetadata } from './operation-metadata.js';
import { operationEntries } from './operation-reference.js';
import { object } from './parse-spec-utils.js';

function requiredCallbackParent(
  pointer: string,
  parentOperationRef: string | undefined,
): string {
  if (parentOperationRef === undefined)
    throw new Error(`operationRef ${pointer} callback has no parent operation`);
  return parentOperationRef;
}

export function inboundPathItemOperations(
  pathItem: JsonObject,
  path: string,
  pointer: string,
  source: 'webhooks',
): WebhookOperationSource[];
export function inboundPathItemOperations(
  pathItem: JsonObject,
  path: string,
  pointer: string,
  source: 'callbacks',
  parentOperationRef: string,
): CallbackOperationSource[];
export function inboundPathItemOperations(
  pathItem: JsonObject,
  path: string,
  pointer: string,
  source: 'webhooks' | 'callbacks',
  parentOperationRef?: string,
): InboundOperationSource[] {
  return operationEntries(pathItem).map((entry) => {
    const operationRef = pointer + '/' + entry.key;
    const operation = object(entry.value, `operationRef ${operationRef}`);
    const shared = {
      operationRef,
      ...operationMetadata(operation, `operationRef ${operationRef}`),
      method: entry.method,
      path,
    };
    const result: InboundOperationSource =
      source === 'callbacks'
        ? {
            candidate: {
              ...shared,
              source,
              parentOperationRef: requiredCallbackParent(
                pointer,
                parentOperationRef,
              ),
            },
            operation,
          }
        : { candidate: { ...shared, source }, operation };
    return result;
  });
}
