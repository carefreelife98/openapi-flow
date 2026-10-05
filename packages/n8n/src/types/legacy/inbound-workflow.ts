import type { WorkflowJSON } from '@n8n/workflow-sdk';
import type {
  OpenApiDocument,
  ParsedDocument,
} from '@openapi-flow/core/internal';
import type {
  InboundOperationCandidate,
  InboundOperationSource,
} from '@openapi-flow/core/internal';

export interface InboundPlan {
  version: '1';
  goal: string;
  operationRef: string;
  webhookPath: string;
  responseStatus: number;
  responseMediaType?: string;
  responseBody?: unknown;
}

export interface InboundRequest {
  spec: OpenApiDocument;
  plan: InboundPlan;
}

export interface InboundWorkflowContext {
  document: ParsedDocument;
  selected: InboundOperationSource;
  plan: InboundPlan;
}

export interface InboundResult {
  status: 'complete';
  plan: InboundPlan;
  evidence: InboundOperationCandidate;
  workflow: WorkflowJSON;
}
