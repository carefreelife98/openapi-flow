import {
  createWorkflowDraft,
  describeWorkflowDraftNativeParameterEdit,
  resolveWorkflowDraftNativeParameterEditTargets,
} from '@openapi-flow/core';
import { workflowDraftEditAssemblyFixture } from './workflow-draft-edit-assembly-fixture.mjs';
import { connectionEditPlan } from './workflow-draft-connection-edit-fixture.mjs';

export async function nativeParameterEditFixture(
  text = 'Change only config count to 4.',
  includeExplanations = false,
) {
  const input = await workflowDraftEditAssemblyFixture(text);
  const { revision, approvals, requirementHistory, ...content } = input.draft;
  if (!Array.isArray(requirementHistory))
    throw new Error('Fixture requirementHistory is required');
  if (revision !== 0 || approvals.length)
    throw new Error('Unexpected fixture metadata');
  const draft = createWorkflowDraft({
    context: input.context,
    content: {
      ...content,
      nativeNodes: [
        {
          id: 'config',
          capability: 'typed-context',
          parameters: {
            count: 0,
            enabled: false,
            nested: { value: 'unchanged' },
          },
        },
        {
          id: 'sibling',
          capability: 'typed-context',
          parameters: {
            count: 9,
            enabled: true,
            nested: { value: 'independent' },
          },
        },
      ],
    },
  });
  const base = { ...input, draft };
  const plan = connectionEditPlan(
    base,
    [{ kind: 'revise-native-node', nodeId: 'config' }],
    includeExplanations,
  );
  return { ...base, plan, resolutions: [], stepId: plan.steps[0].id };
}
export function nativeParameterEvidence(input) {
  const sources = [
    {
      kind: 'message',
      messageId: 'edit-1',
      quote: input.context.messages.find((message) => message.id === 'edit-1')
        .text,
    },
  ];
  return {
    sources,
    ...(input.plan.options.includeExplanations
      ? {
          explanation: {
            reason: 'This current request specifies the parameter change.',
            evidence: sources,
          },
        }
      : {}),
  };
}
export function nativeParameterTargets(input, targets) {
  return {
    decision: {
      status: 'targets',
      targets: targets.map((target) => ({
        ...target,
        ...nativeParameterEvidence(input),
      })),
    },
  };
}
export function nativeParameterContract(input, targets) {
  const result = resolveWorkflowDraftNativeParameterEditTargets({
    ...input,
    fingerprint: describeWorkflowDraftNativeParameterEdit(input).fingerprint,
    proposal: nativeParameterTargets(input, targets),
  });
  if (result.status !== 'ready')
    throw new Error('Expected actual parameter targets');
  return result.contract;
}
export function nativeParameterValues(input, entries) {
  return {
    values: Object.fromEntries(
      entries.map((entry, index) => [
        `parameter-${index + 1}`,
        { ...entry, ...nativeParameterEvidence(input) },
      ]),
    ),
  };
}
export function nativeParameterModel(outputs, during) {
  const requests = [];
  return {
    requests,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const index = requests.length;
          requests.push({ schema, options, messages });
          await during?.(index);
          if (index >= outputs.length)
            throw new Error('Unexpected extra model call');
          return modelMessageEvidenceSelections(outputs[index]);
        },
      };
    },
  };
}
import { modelMessageEvidenceSelections } from './model-message-evidence-selections.mjs';
