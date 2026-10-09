import type { ApiOperationContract } from './api-operation.js';

export interface ApiResponseValidationInput {
  operation: ApiOperationContract;
}

export interface ApiResponseEnvelope {
  statusCode: number;
  headers: Record<string, unknown>;
  body?: unknown;
}

export interface ApiResponseValidationValue {
  statusCode: number;
  mediaType?: string;
  body?: unknown;
}
