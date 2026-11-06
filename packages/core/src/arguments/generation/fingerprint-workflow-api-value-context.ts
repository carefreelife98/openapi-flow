import { createHash } from 'node:crypto';
import type { WorkflowApiValueContext } from '../../types/workflow-api-values.js';
import {
  workflowNonemptySourceMessagesSchema,
  planningEvidenceTextSchema,
} from '../../schemas/planning-evidence-schema.js';
import { captureApiLiteralGenerationInput } from './capture-api-literal-generation-input.js';

/** Fingerprint source data only; OAS validation belongs to compilation, not identity lookup. */
export function fingerprintWorkflowApiValueContext(
  input: WorkflowApiValueContext,
): string {
  const messages = workflowNonemptySourceMessagesSchema.parse(input.messages);
  const scenario = planningEvidenceTextSchema.parse(input.scenario);
  if (typeof input.interpretSchemaChoices !== 'boolean')
    throw new Error('Workflow values.interpretSchemaChoices is required');
  if (
    !Array.isArray(input.calls) ||
    new Set(input.calls.map((c) => c.callId)).size !== input.calls.length
  )
    throw new Error('Workflow values require an array of distinct calls');
  const calls = input.calls.map((call) =>
    captureApiLiteralGenerationInput({
      ...call,
      scenario,
      literalSourceMessages: messages,
    }),
  );
  return createHash('sha256')
    .update(
      JSON.stringify({
        scenario,
        messages,
        calls,
        interpretSchemaChoices: input.interpretSchemaChoices,
      }),
    )
    .digest('hex');
}
