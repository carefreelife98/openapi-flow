import { openApiFlowDiagnosticSchema } from '../schemas/openapi-flow-error-schema.js';
import type {
  OpenApiFlowDiagnostic,
  OpenApiFlowErrorInput,
} from '../types/openapi-flow-error.js';

/** Keep the original exception private; serialize only the explicit diagnostic. */
export class OpenApiFlowError extends Error {
  readonly diagnostic: Readonly<OpenApiFlowDiagnostic>;

  constructor(input: OpenApiFlowErrorInput) {
    super(input.message, { cause: input.cause });
    this.name = 'OpenApiFlowError';
    this.diagnostic = Object.freeze(
      openApiFlowDiagnosticSchema.parse(input.diagnostic),
    );
  }

  toJSON(): OpenApiFlowDiagnostic {
    return { ...this.diagnostic };
  }
}

export function isOpenApiFlowError(error: unknown): error is OpenApiFlowError {
  return error instanceof OpenApiFlowError;
}
