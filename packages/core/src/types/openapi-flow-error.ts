import type { z } from 'zod';
import type {
  openApiFlowDiagnosticSchema,
  openApiFlowErrorCodeSchema,
} from '../schemas/openapi-flow-error-schema.js';

export type OpenApiFlowErrorCode = z.infer<typeof openApiFlowErrorCodeSchema>;
export type OpenApiFlowDiagnostic = z.infer<typeof openApiFlowDiagnosticSchema>;

export interface OpenApiFlowErrorInput {
  message: string;
  diagnostic: OpenApiFlowDiagnostic;
  cause?: unknown;
}

export interface OpenApiFlowOperationBoundary {
  owner: OpenApiFlowDiagnostic['owner'];
  operation: string;
  stage: OpenApiFlowDiagnostic['stage'];
  code: Exclude<OpenApiFlowErrorCode, 'API_BINDING_CALL_COVERAGE_MISMATCH'>;
}
