import type { NodeInstance } from '@n8n/workflow-sdk';
import type {
  ApiOperationContract,
  ApiCallArguments,
} from '@openapi-flow/core';
import type { CredentialBindings } from './legacy/request-workflow.js';

export type N8nSdkNode = NodeInstance<string, string, unknown>;
export interface N8nFragmentEdge {
  from: string;
  output: number;
  to: string;
  input: number;
}
export interface N8nNodeFragment {
  nodeId: string;
  nodes: N8nSdkNode[];
  entry: N8nSdkNode;
  exit: N8nSdkNode;
  inputPorts: Record<string, number>;
  outputPorts: Record<string, number>;
  internalEdges?: N8nFragmentEdge[];
}
export interface CreateHttpRequestNodeInput {
  operation: ApiOperationContract;
  arguments: ApiCallArguments;
  baseUrl: string;
  credentialBindings: CredentialBindings;
  position: [number, number];
  apiNodeNames?: Record<string, string>;
}
