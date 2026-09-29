import type { OpenApiDocument, ParsedDocument } from '../../types/openapi.js';
import type {
  InboundOperationCandidate,
  InboundOperationSource,
} from '../../types/inbound.js';
import { validateAndResolveOpenApiDocument } from '../common/validate-spec.js';
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
  input: OpenApiDocument,
): Promise<InboundOperationCandidate[]> {
  const document = await validateAndResolveOpenApiDocument(input);
  return inboundOperationSourcesFromDocument(document).map(
    (source) => source.candidate,
  );
}
