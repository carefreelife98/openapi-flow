import {
  createWorkflowDraftEditPlan,
  describeWorkflowDraftConnectionEdit,
  resolveWorkflowDraftConnectionEdit,
} from '@openapi-flow/core';
import { workflowDraftEditAssemblyFixture } from './workflow-draft-edit-assembly-fixture.mjs';

export function connectionEditPlan(
  input,
  decisions,
  includeExplanations = false,
) {
  const message = input.context.messages.find(
    (message) => message.id === 'edit-1',
  );
  const sources = [
    { kind: 'message', messageId: message.id, quote: message.text },
  ];
  return createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations },
    proposal: {
      decisions: decisions.map((decision) => ({
        ...decision,
        instruction: message.text,
        sources,
        ...(includeExplanations
          ? {
              explanation: {
                reason: 'The request specifies this routing change.',
                evidence: sources,
              },
            }
          : {}),
      })),
    },
  });
}
export async function workflowDraftConnectionEditFixture(
  includeExplanations = false,
) {
  const input = await workflowDraftEditAssemblyFixture(
    'Run independent only after follow finishes. Retain source to follow.',
  );
  return {
    ...input,
    plan: connectionEditPlan(
      input,
      [{ kind: 'revise-connections', nodeIds: ['independent'] }],
      includeExplanations,
    ),
    resolutions: [],
  };
}
export function connectionEditProposal(input, decisions) {
  const message = input.context.messages.find(
    (message) => message.id === 'edit-1',
  );
  const sources = [
    { kind: 'message', messageId: message.id, quote: message.text },
  ];
  return {
    decisions: decisions.map((decision) => ({
      ...decision,
      sources,
      ...(input.plan.options.includeExplanations
        ? {
            explanation: {
              reason: 'This request grounds the connection decision.',
              evidence: sources,
            },
          }
        : {}),
    })),
  };
}
export function resolveConnectionEdit(input, decisions) {
  return resolveWorkflowDraftConnectionEdit({
    ...input,
    fingerprint: describeWorkflowDraftConnectionEdit(input).fingerprint,
    proposal: connectionEditProposal(input, decisions),
  });
}
export const addConnection = (from, to, output = 'main', input = 'main') => ({
  kind: 'add',
  source: { nodeId: from, port: output },
  target: { nodeId: to, port: input },
});
export function connectionEditModel(output, during) {
  const requests = [];
  return {
    requests,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          requests.push({ schema, options, messages });
          await during?.();
          return modelMessageEvidenceSelections(output);
        },
      };
    },
  };
}
import { modelMessageEvidenceSelections } from './model-message-evidence-selections.mjs';
