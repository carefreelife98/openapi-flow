import type { ApiInputAnswerContext } from '../../types/api-input-answer-extraction.js';
import type { ApiInputMessageReference } from '../../types/api-input-literal-source.js';
import type { ApiInputMessageSourceCatalog } from '../../types/api-input-source-selection.js';
import type { WorkflowSourceMessage } from '../../types/workflow-draft.js';
import { workflowNonemptySourceMessagesSchema } from '../../schemas/planning-evidence-schema.js';
import { describeApiInputSources } from './describe-api-input-sources.js';

/** Original messages have separate catalogs; offsets never refer to a JSON wrapper or joined text. */
export function describeApiInputMessageSources(
  messages: WorkflowSourceMessage[],
): ApiInputMessageSourceCatalog[] {
  return workflowNonemptySourceMessagesSchema
    .parse(messages)
    .map((message) => ({
      messageId: message.id,
      sources: describeApiInputSources(message.text),
    }));
}

export function hasApiInputAnswerSourceText(
  context: ApiInputAnswerContext,
): boolean {
  if (context.sourceMessages !== undefined)
    return workflowNonemptySourceMessagesSchema
      .parse(context.sourceMessages)
      .some((message) => message.text !== '');
  if (typeof context.reply !== 'string')
    throw new Error('API input reply must be a string');
  return context.reply !== '';
}

/** Resolved evidence always names its actual message. Legacy reply evidence cannot claim one. */
export function resolveApiInputAnswerSourceText(
  context: ApiInputAnswerContext,
  source: ApiInputMessageReference,
): string {
  if (context.sourceMessages === undefined) {
    if (source.messageId !== undefined)
      throw new Error(
        'API input source messageId requires explicit sourceMessages',
      );
    if (typeof context.reply !== 'string')
      throw new Error('API input reply must be a string');
    return context.reply;
  }
  const messages = workflowNonemptySourceMessagesSchema.parse(
    context.sourceMessages,
  );
  const message = messages.find((item) => item.id === source.messageId);
  if (!message)
    throw new Error(
      'API input source messageId is missing or not in sourceMessages',
    );
  return message.text;
}
