import { createHash } from 'node:crypto';
import type { WorkflowApiArgumentContext } from '../../types/workflow-api-arguments.js';
import { captureApiLiteralGenerationInput } from './capture-api-literal-generation-input.js';

/** Roles, bindings, confirmed inputs and OAS are part of a planning revision. */
export function fingerprintWorkflowApiArgumentContext(
  input: WorkflowApiArgumentContext,
): string {
  const calls = input.calls.map((call) =>
    captureApiLiteralGenerationInput({
      ...call,
      scenario: input.scenario,
      literalSourceMessages: input.catalog.messages,
    }),
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
