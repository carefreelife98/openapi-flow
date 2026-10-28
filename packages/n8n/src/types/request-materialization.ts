import type {
  ApiCallArguments,
  ApiOperationContract,
  JsonValue,
} from '@openapi-flow/core';
import type { Operation } from '@openapi-flow/core/internal';
import type { DeferredApiInputSlot } from '@openapi-flow/core';
import type { HttpRequestPagination } from './http-request-pagination.js';
import type {
  PreparedRequestBody,
  RequestHeader,
} from './legacy/request-node.js';

export interface RequestMaterializationConfig {
  pagination?: HttpRequestPagination;
  contract: ApiOperationContract;
  operation: Operation;
  arguments: RequestMaterializationArguments;
  templateUrl: string;
  deferredInputs?: DeferredRequestRuntimeInputs;
}
export type RequestMaterializationArguments = Pick<
  ApiCallArguments,
  | 'callId'
  | 'values'
  | 'bindings'
  | 'unresolvedInputs'
  | 'requestMediaType'
  | 'requestedInputs'
>;
export interface DeferredRequestRuntimeInputs {
  revision: number;
  inputNodeName: string;
  slots: DeferredApiInputSlot[];
}
export interface MaterializedHttpRequest {
  url: string;
  headers: RequestHeader[];
  body?: PreparedRequestBody;
}
export type ResponseBodies = Record<string, JsonValue>;
export interface RuntimeHttpRequest extends MaterializedHttpRequest {
  headersJson: string;
}
export interface RuntimeRequestValidator {
  (value: unknown): boolean;
  errors?: unknown;
}
