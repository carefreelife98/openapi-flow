import { createHash } from 'node:crypto';
import type {
  ApiBindingKeyCandidate,
  CreateApiBindingKeyCatalogInput,
} from '../../types/api-binding-keys.js';
import { apiBindingKeyProposalSchema } from '../../schemas/api-binding-key-schema.js';
import { workflowNonemptySourceMessagesSchema } from '../../schemas/planning-evidence-schema.js';
import { describeApiLiteralJsonSources } from '../../arguments/sources/describe-api-literal-json-sources.js';
import { verifyApiInputLiteralSource } from '../../arguments/sources/verify-api-input-literal-source.js';
import { pointerTokens } from '../json-pointer.js';

/** Copy verified original key/path values into code-owned choice identities. */
export function createApiBindingKeyCatalog(
  input: CreateApiBindingKeyCatalogInput,
): ApiBindingKeyCandidate[] {
  const selections = apiBindingKeyProposalSchema
    .array()
    .parse(input.selections);
  const messages = workflowNonemptySourceMessagesSchema.parse(input.messages);
  const json = describeApiLiteralJsonSources(messages);
  if (
    !Array.isArray(input.nodeIds) ||
    input.nodeIds.some((id) => typeof id !== 'string' || !id.trim())
  )
    throw new Error('Binding key catalog.nodeIds must identify actual nodes');
  const candidates = new Map<string, ApiBindingKeyCandidate>();
  for (const selection of selections) {
    if (!input.nodeIds.includes(selection.nodeId))
      throw new Error(
        `Binding key selection references unavailable node ${selection.nodeId}`,
      );
    const message = messages.find(
      (item) => item.id === selection.source.messageId,
    );
    if (!message)
      throw new Error(
        'Binding key selection requires an original source message',
      );
    let sourceText: string;
    if (selection.source.sourceFormat === 'text') {
      if (!selection.value.length)
        throw new Error(
          'Empty binding keys require an original JSON string token',
        );
      sourceText = selection.value;
    } else {
      const candidateId = selection.source.candidateId;
      const candidate = json
        .find((item) => item.messageId === message.id)
        ?.json.find((item) => item.id === candidateId);
      if (!candidate)
        throw new Error(
          'Binding key selection cites an unavailable original JSON token',
        );
      sourceText = candidate.text;
    }
    verifyApiInputLiteralSource({
      sourceFormat: selection.source.sourceFormat,
      sourceText,
      text: message.text,
      value: selection.value,
      label: `Binding ${selection.kind} for ${selection.nodeId}`,
    });
    const tokens =
      selection.kind === 'key'
        ? [selection.value]
        : pointerTokens(selection.value);
    if (!tokens.length)
      throw new Error(
        'Binding descendant paths require a nonempty original JSON pointer',
      );
    const candidate: ApiBindingKeyCandidate = {
      ...selection,
      id:
        'binding-key-' +
        createHash('sha256')
          .update(JSON.stringify(selection))
          .digest('hex')
          .slice(0, 24),
      tokens,
    };
    candidates.set(candidate.id, candidate);
  }
  return [...candidates.values()];
}
