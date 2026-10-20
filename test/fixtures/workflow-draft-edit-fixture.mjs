import { workflowDraftFixture } from './workflow-draft-fixture.mjs';
import { modelMessageEvidenceSelections } from './model-message-evidence-selections.mjs';

export async function workflowDraftEditFixture(
  text = 'Add a second item lookup after the current checks.',
) {
  const fixture = await workflowDraftFixture();
  fixture.context.messages.push({ id: 'edit-1', text });
  return { ...fixture, requestMessageIds: ['edit-1'] };
}

export function editDecision(fields, instruction, quote = instruction) {
  return {
    ...fields,
    instruction,
    sources: [{ kind: 'message', messageId: 'edit-1', quote }],
  };
}

export function scriptedDraftEditModel(output) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          calls.push({ schema, options, messages });
          return modelMessageEvidenceSelections(
            typeof output === 'function' ? output(calls.at(-1)) : output,
          );
        },
      };
    },
  };
}
