import { z } from 'zod';
import { workflowConnectionProposalAttemptSchema } from '../../schemas/workflow-connection-proposal-attempt-schema.js';
import type {
  CreateWorkflowConnectionProposalAttemptInput,
  WorkflowConnectionProposalAttempt,
} from '../../types/workflow-connection-proposal-attempt.js';

/** Capture decoded proposal data without normalizing it. Sensitive or non-JSON output is explicitly unavailable. */
export function createWorkflowConnectionProposalAttempt(
  input: CreateWorkflowConnectionProposalAttemptInput,
): WorkflowConnectionProposalAttempt {
  let parsed: ReturnType<ReturnType<typeof z.json>['safeParse']>;
  try {
    parsed = z.json().safeParse(input.output);
  } catch {
    return workflowConnectionProposalAttemptSchema.parse({
      id: input.id,
      expected: input.expected,
      capture: { status: 'unavailable', reason: 'non-json-output' },
    });
  }
  if (!parsed.success)
    return workflowConnectionProposalAttemptSchema.parse({
      id: input.id,
      expected: input.expected,
      capture: { status: 'unavailable', reason: 'non-json-output' },
    });
  const sensitiveKey =
    /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token|pin|private[_-]?key|account[_-]?number|resident[_-]?number|ssn|email|phone)$/i;
  const sensitiveText =
    /-----BEGIN [^-]*PRIVATE KEY-----|\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_.-]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:password|passwd|client[_-]?secret|access[_-]?token|refresh[_-]?token|api[_-]?key)\s*[:=]\s*\S+/i;
  function sensitive(value: z.infer<ReturnType<typeof z.json>>): boolean {
    if (typeof value === 'string') return sensitiveText.test(value);
    if (Array.isArray(value)) return value.some(sensitive);
    if (value !== null && typeof value === 'object')
      return Object.entries(value).some(
        ([key, item]) => sensitiveKey.test(key) || sensitive(item),
      );
    return false;
  }
  return workflowConnectionProposalAttemptSchema.parse({
    id: input.id,
    expected: input.expected,
    capture: sensitive(parsed.data)
      ? { status: 'withheld', reason: 'sensitive-content' }
      : { status: 'captured', output: structuredClone(parsed.data) },
  });
}
