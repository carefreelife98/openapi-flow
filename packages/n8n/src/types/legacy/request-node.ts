import type { NodeConfig } from '@n8n/workflow-sdk';
import type { Operation } from '@openapi-flow/core/internal';

export type RequiredFields = Record<string, string>;
export type ResolvedAuthentication = Required<
  Pick<NodeConfig, 'parameters' | 'credentials'>
>;

export interface RequestHeader {
  name: string;
  value: string;
}

export interface PreparedRequestBody {
  contentType: 'json' | 'form-urlencoded';
  value: string;
}

export interface HttpRequestNodeInput {
  operation: Operation;
  id: string;
  name: string;
  position: [number, number];
  url: string;
  body?: PreparedRequestBody;
  headers: RequestHeader[];
  authentication?: ResolvedAuthentication;
  shouldAssert: boolean;
}
