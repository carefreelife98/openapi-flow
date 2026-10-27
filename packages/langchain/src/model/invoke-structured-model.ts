import { OpenApiFlowError, runOpenApiFlowOperation } from '@openapi-flow/core';
import type { OpenApiFlowDiagnostic } from '@openapi-flow/core';
import type { InvokeStructuredModelInput } from '../types/structured-model.js';

function modelAbortError(
  operation: string,
  signal: AbortSignal,
  cause: unknown,
): OpenApiFlowError {
  return new OpenApiFlowError({
    message: 'Structured model invocation was aborted',
    diagnostic: {
      owner: 'langchain',
      operation,
      stage: 'model-invocation',
      code:
        signal.reason instanceof DOMException &&
        signal.reason.name === 'TimeoutError'
          ? 'MODEL_TIMEOUT'
          : 'MODEL_ABORTED',
    },
    cause,
  });
}

function assertModelNotAborted(operation: string, signal?: AbortSignal): void {
  if (signal?.aborted) throw modelAbortError(operation, signal, signal.reason);
}

/** Provider-neutral: a failed invoke is not proof of a network or timeout failure. */
export async function invokeStructuredModel<Output extends object>(
  input: InvokeStructuredModelInput<Output>,
): Promise<Output> {
  assertModelNotAborted(input.operation, input.signal);
  const runnable = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: input.operation,
      stage: 'model-configuration',
      code: 'MODEL_CONFIGURATION_FAILED',
    },
    () =>
      input.model.withStructuredOutput<Output>(input.schema, {
        name: input.name,
        method: input.method,
        ...(input.strict === undefined ? {} : { strict: input.strict }),
      }),
  );
  try {
    const output = await runnable.invoke(
      input.messages,
      input.signal === undefined ? undefined : { signal: input.signal },
    );
    assertModelNotAborted(input.operation, input.signal);
    return output;
  } catch (cause) {
    if (cause instanceof OpenApiFlowError) throw cause;
    if (input.signal?.aborted)
      throw modelAbortError(input.operation, input.signal, cause);
    // The official error code survives distinct supported peer copies; class identity does not.
    const outputParsingFailed =
      typeof cause === 'object' &&
      cause !== null &&
      Object.getOwnPropertyDescriptor(cause, 'lc_error_code')?.value ===
        'OUTPUT_PARSING_FAILURE';
    const diagnostic: OpenApiFlowDiagnostic = {
      owner: 'langchain',
      operation: input.operation,
      stage: outputParsingFailed ? 'model-output' : 'model-invocation',
      code: outputParsingFailed
        ? 'MODEL_OUTPUT_INVALID'
        : cause instanceof DOMException && cause.name === 'TimeoutError'
          ? 'MODEL_TIMEOUT'
          : cause instanceof DOMException && cause.name === 'AbortError'
            ? 'MODEL_ABORTED'
            : 'MODEL_INVOCATION_FAILED',
    };
    // Record only this error's explicit HTTP status. No message/name/cause heuristics.
    const status =
      typeof cause === 'object' && cause !== null
        ? Object.getOwnPropertyDescriptor(cause, 'status')?.value
        : undefined;
    if (
      typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
    )
      diagnostic.httpStatus = status;
    throw new OpenApiFlowError({
      message: cause instanceof Error ? cause.message : input.operation,
      diagnostic,
      cause,
    });
  }
}
