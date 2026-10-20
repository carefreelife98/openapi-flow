import { createWorkflowDraftEditPlan } from '@openapi-flow/core';
import { workflowDraftEditAssemblyFixture } from './workflow-draft-edit-assembly-fixture.mjs';

export function bindingEditPlan(input, decisions, includeExplanations = false) {
  const message = input.context.messages.find(
    (message) => message.id === 'edit-1',
  );
  const sources = [
    { kind: 'message', messageId: 'edit-1', quote: message.text },
  ];
  const explanation = {
    reason: 'The current request explicitly changes this producer mapping.',
    evidence: sources,
  };
  return createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations },
    proposal: {
      decisions: decisions.map((decision) => ({
        ...decision,
        instruction: message.text,
        sources,
        ...(includeExplanations ? { explanation } : {}),
      })),
    },
  });
}
export async function workflowDraftApiBindingEditFixture(
  text = 'Use the independent lookup response value for the follow API path id.',
  includeExplanations = false,
) {
  const input = await workflowDraftEditAssemblyFixture(text);
  const plan = bindingEditPlan(
    input,
    [{ kind: 'revise-api-bindings', nodeId: 'follow' }],
    includeExplanations,
  );
  return {
    ...input,
    plan,
    resolutions: [],
    scope: { kind: 'step', stepId: plan.steps[0].id },
  };
}
export function bindingEditProposal(input, decisions) {
  const sources = [
    {
      kind: 'message',
      messageId: 'edit-1',
      quote: input.context.messages.find((message) => message.id === 'edit-1')
        .text,
    },
  ];
  return {
    decisions: decisions.map((decision) => ({
      ...decision,
      sources,
      ...(input.plan.options.includeExplanations
        ? {
            explanation: {
              reason: 'This current request grounds the mapping choice.',
              evidence: sources,
            },
          }
        : {}),
    })),
  };
}
export function bindingEditModel(output, during) {
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
export const independentBindingDecision = {
  kind: 'bind',
  targetPointer: '/path/id',
  sourceNodeId: 'independent',
  sourcePointer: '/value',
};
import { modelMessageEvidenceSelections } from './model-message-evidence-selections.mjs';
