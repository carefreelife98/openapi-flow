import type { NodeInstance } from '@n8n/workflow-sdk';
import type {
  ApiOperationContract,
  ApiCallArguments,
} from '@openapi-flow/core';
import type {
  HttpRequestDeploymentOptions,
  ResolvedHttpRequestDeployment,
} from './request-deployment.js';
import type {
  N8nNativeOutputSource,
  N8nOutputBindingSource,
} from './output-binding-source.js';

export type N8nSdkNode = NodeInstance<string, string, unknown>;
export interface N8nFragmentEdge {
  from: string;
  output: number;
  to: string;
  input: number;
}
export interface N8nFragmentInputEndpoint {
  nodeId: string;
  input: number;
}
export interface N8nNodeFragment {
  nodeId: string;
  /** Compiler-owned contract: one linked output per input, or an execution error. */
  preservesInputItems?: boolean;
  nodes: N8nSdkNode[];
  entry: N8nSdkNode;
  exit: N8nSdkNode;
  inputPorts: Record<string, number>;
  /** Explicit per-port SDK entry nodes for fragments with independent input readers. */
  inputEndpoints?: Record<string, N8nFragmentInputEndpoint>;
  outputPorts: Record<string, number>;
  internalEdges?: N8nFragmentEdge[];
  bindingSources?: N8nOutputBindingSource[];
}
export interface CreateHttpRequestNodeInput extends HttpRequestDeploymentOptions {
  operation: ApiOperationContract;
  arguments: ApiCallArguments;
  position: [number, number];
  apiNodeNames?: Record<string, string>;
  nativeOutputSources?: N8nNativeOutputSource[];
  /** Linked mode uses n8n ancestry, never index-zipping independent source arrays. */
  itemMode?: 'linked';
  /** When supplied, every referenced API must have its original response contract. */
  apiResponseContracts?: Record<string, ApiOperationContract>;
}

export type CreateBoundHttpRequestNodeInput = CreateHttpRequestNodeInput &
  ResolvedHttpRequestDeployment;
