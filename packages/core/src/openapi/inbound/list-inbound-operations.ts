import type { ParsedDocument } from '../../types/openapi.js';
import type {
  InboundOperationCandidate,
  InboundOperationSource,
} from '../../types/inbound.js';
import { validatedDocument } from '../common/validate-spec.js';
import { callbackOperationsFromDocument } from './callback/parse-callback-operations.js';
import { webhookOperationsFromDocument } from './webhook/parse-webhook-operations.js';

export function inboundOperationSourcesFromDocument(
  document: ParsedDocument,
): InboundOperationSource[] {
  return [
    ...webhookOperationsFromDocument(document),
    ...callbackOperationsFromDocument(document),
  ];
}

export async function inboundOperationsFromSpec(
  input: unknown,
): Promise<InboundOperationCandidate[]> {
  const document = await validatedDocument(input);
  return inboundOperationSourcesFromDocument(document).map(
    (source) => source.candidate,
  );
}
