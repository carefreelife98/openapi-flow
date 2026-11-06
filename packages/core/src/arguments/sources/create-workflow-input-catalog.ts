import { createHash } from 'node:crypto';
import type { WorkflowSourceMessage } from '../../types/workflow-draft.js';
import type { WorkflowInputCatalog } from '../../types/workflow-api-arguments.js';
import { workflowNonemptySourceMessagesSchema } from '../../schemas/planning-evidence-schema.js';
import { describeApiInputSources } from './describe-api-input-sources.js';

/** No value inference: all selectable tokens and JSON spans come from original bytes. */
export function createWorkflowInputCatalog(
  originalMessages: WorkflowSourceMessage[],
): WorkflowInputCatalog {
  const messages = structuredClone(
    workflowNonemptySourceMessagesSchema.parse(originalMessages),
  );
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(messages))
    .digest('hex');
  return {
    fingerprint,
    messages,
    sources: messages.map((message, index) => {
      const sources = describeApiInputSources(message.text);
      const prefix = `${fingerprint}:${index}:`;
      return {
        messageId: message.id,
        sources: {
          json: sources.json.map((source) => ({
            ...source,
            id: prefix + source.id,
          })),
          text: sources.text.map((segment) => ({
            ...segment,
            id: prefix + segment.id,
          })),
        },
      };
    }),
  };
}

/** A serialized checkpoint is untrusted until its code-derived catalog matches. */
export function validateWorkflowInputCatalog(
  catalog: WorkflowInputCatalog,
): WorkflowInputCatalog {
  const current = createWorkflowInputCatalog(catalog.messages);
  if (JSON.stringify(current) !== JSON.stringify(catalog))
    throw new Error(
      'Workflow input catalog is stale or has changed original sources',
    );
  return current;
}
