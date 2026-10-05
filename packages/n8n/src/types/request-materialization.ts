import type {
  ApiCallArguments,
  ApiOperationContract,
  JsonValue,
} from '@openapi-flow/core';
import type { Operation } from '@openapi-flow/core/internal';
import type {
  PreparedRequestBody,
  RequestHeader,
} from './legacy/request-node.js';

export interface RequestMaterializationConfig {
  contract: ApiOperationContract;
  operation: Operation;
  arguments: ApiCallArguments;
  templateUrl: string;
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
