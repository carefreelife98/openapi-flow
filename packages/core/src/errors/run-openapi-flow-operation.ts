import { OpenApiFlowError } from './openapi-flow-error.js';
import type { OpenApiFlowOperationBoundary } from '../types/openapi-flow-error.js';

/** Identify the actual boundary, never guess an unknown error's underlying cause. */
export function runOpenApiFlowOperation<Result>(
  boundary: OpenApiFlowOperationBoundary,
  execute: () => Result,
): Result {
  try {
    return execute();
  } catch (cause) {
    if (cause instanceof OpenApiFlowError) throw cause;
    throw new OpenApiFlowError({
      message: cause instanceof Error ? cause.message : boundary.operation,
      diagnostic: boundary,
      cause,
    });
  }
}

export async function runOpenApiFlowAsyncOperation<Result>(
  boundary: OpenApiFlowOperationBoundary,
  execute: () => Promise<Result>,
): Promise<Result> {
  try {
    return await execute();
  } catch (cause) {
    if (cause instanceof OpenApiFlowError) throw cause;
    throw new OpenApiFlowError({
      message: cause instanceof Error ? cause.message : boundary.operation,
      diagnostic: boundary,
      cause,
    });
  }
}
