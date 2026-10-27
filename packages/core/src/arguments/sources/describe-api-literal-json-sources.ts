import { createHash } from 'node:crypto';
import type { WorkflowSourceMessage } from '../../types/workflow-draft.js';
import type { ApiLiteralMessageJsonSources } from '../../types/api-input-literal-source.js';
import { workflowNonemptySourceMessagesSchema } from '../../schemas/planning-evidence-schema.js';
import { describeApiInputSources } from './describe-api-input-sources.js';

/** Original complete JSON literals only; never send the character-by-character text catalog. */
export function describeApiLiteralJsonSources(
  messages: WorkflowSourceMessage[],
): ApiLiteralMessageJsonSources[] {
  return workflowNonemptySourceMessagesSchema.parse(messages).map((message) => {
    const json = new Map<string, string>();
    for (const { text } of describeApiInputSources(message.text).json) {
      const id = `json:${createHash('sha256').update(text).digest('hex')}`;
      json.set(id, text);
    }
    return {
      messageId: message.id,
      json: [...json].map(([id, text]) => ({ id, text })),
    };
  });
}
