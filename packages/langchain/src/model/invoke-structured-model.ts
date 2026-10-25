import { OutputParserException } from '@langchain/core/output_parsers';
import { OpenApiFlowError, runOpenApiFlowOperation } from '@openapi-flow/core';
import type { OpenApiFlowDiagnostic } from '@openapi-flow/core';
import type { InvokeStructuredModelInput } from '../types/structured-model.js';

/** Provider-neutral: a failed invoke is not proof of a network or timeout failure. */
export async function invokeStructuredModel<Output extends object>(
  input: InvokeStructuredModelInput<Output>,
): Promise<Output> {
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
        strict: true,
      }),
  );
  try {
    return await runnable.invoke(
      input.messages,
      input.signal === undefined ? undefined : { signal: input.signal },
    );
  } catch (cause) {
    if (cause instanceof OpenApiFlowError) throw cause;
    const diagnostic: OpenApiFlowDiagnostic = {
      owner: 'langchain',
      operation: input.operation,
      stage:
        cause instanceof OutputParserException
          ? 'model-output'
          : 'model-invocation',
      code:
        cause instanceof OutputParserException
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
