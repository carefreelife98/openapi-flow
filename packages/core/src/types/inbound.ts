import type { JsonObject, OperationCandidate } from './openapi.js';

export interface WebhookOperationCandidate extends OperationCandidate {
  source: 'webhooks';
}

export interface CallbackOperationCandidate extends OperationCandidate {
  source: 'callbacks';
  parentOperationRef: string;
}

export type InboundOperationCandidate =
  WebhookOperationCandidate | CallbackOperationCandidate;

export interface WebhookOperationSource {
  candidate: WebhookOperationCandidate;
  operation: JsonObject;
}

export interface CallbackOperationSource {
  candidate: CallbackOperationCandidate;
  operation: JsonObject;
}

export type InboundOperationSource =
  WebhookOperationSource | CallbackOperationSource;
