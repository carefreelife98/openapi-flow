import { createHash } from 'node:crypto';
import type {
  WorkflowInputCatalog,
  WorkflowInputSelection,
  VerifiedWorkflowInput,
} from '../../types/workflow-api-arguments.js';
import { readApiInputLiteralSource } from './read-api-input-literal-source.js';
import { validateWorkflowInputCatalog } from './create-workflow-input-catalog.js';
import { workflowInputSelectionSchema } from '../../schemas/workflow-api-argument-plan-schema.js';

/** Source identity is derived from a catalog reference, never generated beside a value. */
export function resolveWorkflowInputSelection(
  catalog: WorkflowInputCatalog,
  selection: WorkflowInputSelection,
): VerifiedWorkflowInput {
  return resolvePreparedWorkflowInputSelection(
    validateWorkflowInputCatalog(catalog),
    workflowInputSelectionSchema.parse(selection),
  );
}

/** Internal entry for one synchronously validated compiler snapshot. */
export function resolvePreparedWorkflowInputSelection(
  catalog: WorkflowInputCatalog,
  selection: WorkflowInputSelection,
): VerifiedWorkflowInput {
  for (const entry of catalog.sources) {
    const message = catalog.messages.find(
      (item) => item.id === entry.messageId,
    );
    if (message === undefined)
      throw new Error(
        `Workflow input catalog has no original message ${entry.messageId}`,
      );
    let sourceText: string | undefined;
    let sourceOffset: number | undefined;
    let sourceLength: number | undefined;
    if (selection.kind === 'json') {
      const candidate = entry.sources.json.find(
        (candidate) => candidate.id === selection.sourceId,
      );
      if (candidate !== undefined) {
        sourceText = candidate.text;
        sourceOffset = candidate.offset;
        sourceLength = candidate.length;
      }
    } else {
      const segment = entry.sources.text.find(
        (candidate) => candidate.id === selection.sourceId,
      );
      if (segment !== undefined) {
        const start = segment.tokens.findIndex(
          (token) => token.id === selection.startTokenId,
        );
        const end = segment.tokens.findIndex(
          (token) => token.id === selection.endTokenId,
        );
        if (start < 0 || end < start)
          throw new Error(
            'Workflow text input requires ordered tokens from its selected source region',
          );
        const first = segment.tokens[start]!;
        const last = segment.tokens[end]!;
        sourceText = message.text.slice(
          first.offset,
          last.offset + last.length,
        );
        sourceOffset = first.offset;
        sourceLength = last.offset + last.length - first.offset;
      }
    }
    if (sourceText === undefined) continue;
    if (sourceOffset === undefined || sourceLength === undefined)
      throw new Error(
        'Workflow input selection has no original lexical location',
      );
    const sourceFormat = selection.kind;
    const parsed = readApiInputLiteralSource({
      text: message.text,
      sourceText,
      sourceFormat,
      label: 'Workflow input selection',
    });
    const source = {
      messageId: message.id,
      sourceText,
      sourceFormat,
      occurrences: [{ offset: sourceOffset, length: sourceLength }],
    };
    return {
      id: `input:${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`,
      value: parsed.value,
      source,
    };
  }
  throw new Error(
    `Workflow input source ${selection.sourceId} is unknown or belongs to another revision`,
  );
}
