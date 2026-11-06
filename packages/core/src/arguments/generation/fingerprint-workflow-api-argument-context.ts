import { createHash } from 'node:crypto';
import type { WorkflowApiArgumentContext } from '../../types/workflow-api-arguments.js';
import { describeApiLiteralGeneration } from './describe-api-literal-generation.js';

/** Roles, bindings, confirmed inputs and OAS are part of a planning revision. */
export function fingerprintWorkflowApiArgumentContext(
  input: WorkflowApiArgumentContext,
): string {
  const calls = input.calls.map(
    (call) =>
      describeApiLiteralGeneration({
        ...call,
        scenario: input.scenario,
        literalSourceMessages: input.catalog.messages,
      }).input,
  );
  return createHash('sha256')
    .update(
      JSON.stringify({
        catalog: input.catalog.fingerprint,
        scenario: input.scenario,
        calls,
      }),
    )
    .digest('hex');
}
