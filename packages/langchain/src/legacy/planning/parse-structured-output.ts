import type { ZodType } from 'zod';

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
  throw new Error(`${source} is invalid: ${issues.join('; ')}`, {
    cause: parsed.error,
  });
}
