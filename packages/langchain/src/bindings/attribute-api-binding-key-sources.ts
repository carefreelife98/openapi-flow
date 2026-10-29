import type {
  ApiBindingKeyProposal,
  WorkflowSourceMessage,
} from '@openapi-flow/core';
import type { ApiBindingGeneratedKeySelection } from '../types/api-binding-key-generation.js';

export function attributeApiBindingKeySources(
  selections: ApiBindingGeneratedKeySelection[],
  messages?: WorkflowSourceMessage[],
): ApiBindingKeyProposal[] {
  if (messages === undefined || !messages.length)
    throw new Error('Binding key extraction requires original source messages');
  return selections.map((selection) => {
    if (
      messages.length === 1 &&
      selection.source.messageId !== undefined &&
      selection.source.messageId !== messages[0]!.id
    )
      throw new Error(
        'Binding key selection changed its sole original source message',
      );
    const source =
      messages.length === 1
        ? { ...selection.source, messageId: messages[0]!.id }
        : selection.source;
    if (source.messageId === undefined)
      throw new Error(
        'Multiple binding key source messages require a selected messageId',
      );
    return { ...selection, source: { ...source, messageId: source.messageId } };
  });
}
