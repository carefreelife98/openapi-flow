import type { ParsedDocument } from '../../types/openapi.js';
import type { WebhookOperationSource } from '../../types/inbound.js';
import { inboundPathItemOperations } from '../common/inbound-path-item-operations.js';
import { pointerSegment } from '../common/operation-reference.js';
import { dereferencedObject, object } from '../common/parse-spec-utils.js';

export function webhookOperationsFromDocument(
  document: ParsedDocument,
): WebhookOperationSource[] {
  if (document.spec.webhooks === undefined) return [];
  const webhooks = object(document.spec.webhooks, 'spec.webhooks');
  return Object.entries(webhooks).flatMap(([name, raw]) => {
    const pointer = '#/webhooks/' + pointerSegment(name);
    const pathItem = dereferencedObject(raw, `spec.webhooks[${name}]`);
    return inboundPathItemOperations(pathItem, name, pointer, 'webhooks');
  });
}
