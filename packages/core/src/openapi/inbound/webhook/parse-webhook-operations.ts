import type { ParsedDocument } from '../../../types/openapi.js';
import type { WebhookOperationSource } from '../../../types/inbound.js';
import { pointerSegment } from '../../common/operation-reference.js';
import { dereferencedObject, object } from '../../common/parse-spec-utils.js';
import { inboundPathItemOperations } from '../inbound-path-item-operations.js';

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
