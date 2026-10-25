import type { ZodType } from 'zod';
import { OpenApiFlowError } from '@openapi-flow/core';

export function parseStructuredOutput<Output>(
  schema: ZodType<Output>,
  value: unknown,
  source: string,
): Output {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map(
    (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
  );
  throw new OpenApiFlowError({
    message: `${source} is invalid: ${issues.join('; ')}`,
    diagnostic: {
      owner: 'langchain',
      operation: 'parseStructuredOutput',
      stage: 'model-output',
      code: 'MODEL_OUTPUT_INVALID',
    },
    cause: parsed.error,
  });
}
