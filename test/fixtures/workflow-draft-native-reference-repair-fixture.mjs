import {
  createWorkflowDraft,
  stageWorkflowDraftEdit,
  describeWorkflowDraftNativeReferenceRepair,
  resolveWorkflowDraftNativeReferenceRepair,
} from '@openapi-flow/core';
import { resolveN8nNativeFeatures, N8nNativeFeature } from '@openapi-flow/n8n';
import { workflowDraftEditAssemblyFixture } from './workflow-draft-edit-assembly-fixture.mjs';
import { connectionEditPlan } from './workflow-draft-connection-edit-fixture.mjs';

export async function nativeReferenceRepairFixture(
  includeExplanations = false,
  operationPath = '/replacement/{id}',
) {
  const base = await workflowDraftEditAssemblyFixture(
    'Replace the source API. Use its renamed response in gate and check; preserve the expected value, operator, messages and routes.',
  );
  base.context.capabilities.push(
    ...resolveN8nNativeFeatures({
      features: [N8nNativeFeature.If, N8nNativeFeature.AssertResponses],
    }).capabilities,
  );
  const { revision, approvals, requirementHistory, ...content } = base.draft;
  if (!Array.isArray(requirementHistory))
    throw new Error('Fixture requirementHistory is required');
  if (revision !== 0 || approvals.length)
    throw new Error('Unexpected fixture revision');
  const operand = { source: 'response', nodeId: 'source', pointer: '/value' };
  const check = {
    left: operand,
    operator: 'equals',
    right: { source: 'literal', value: 'from-source' },
  };
  base.draft = createWorkflowDraft({
    context: base.context,
    content: {
      ...content,
      nativeNodes: [
        {
          id: 'gate',
          capability: 'if',
          parameters: { combinator: 'and', conditions: [check] },
        },
        {
          id: 'check',
          capability: 'assert-responses',
          parameters: {
            checks: [
              { ...check, message: 'Keep this exact assertion message' },
            ],
          },
        },
      ],
      edges: [
        ...content.edges,
        { from: 'source', output: 'main', to: 'gate', input: 'main' },
        { from: 'source', output: 'main', to: 'check', input: 'main' },
      ],
    },
  });
  const operation = base.context.operations.find(
    (operation) => operation.path === operationPath,
  );
  const plan = connectionEditPlan(
    base,
    [
      {
        kind: 'replace-api-operation',
        nodeId: 'source',
        operation: operation.key,
      },
    ],
    includeExplanations,
  );
  const resolutions = [
    {
      stepId: plan.steps[0].id,
      kind: 'api-call',
      values: { path: { id: 'replacement-id' } },
      bindings: [],
    },
  ];
  const input = { ...base, plan, resolutions };
  const task = stageWorkflowDraftEdit(input).pendingRepairs.find(
    (task) => task.nodeId === 'gate',
  );
  return { ...input, taskId: task.id };
}
export function nativeReferenceProposal(input, choices) {
  const context = describeWorkflowDraftNativeReferenceRepair(input);
  return {
    decisions: Object.fromEntries(
      context.bindings.map((binding, index) => [
        binding.id,
        {
          ...choices[index],
          sourceMessageIds: [...input.requestMessageIds],
          ...(input.plan.options.includeExplanations
            ? {
                explanation: {
                  reason:
                    'The current request specifies this reference change.',
                  evidence: [
                    ...input.requestMessageIds.map((messageId) => ({
                      kind: 'message',
                      messageId,
                    })),
                    ...(choices[index].kind === 'bind'
                      ? [
                          {
                            kind: 'source',
                            nodeId: choices[index].sourceNodeId,
                          },
                        ]
                      : []),
                  ],
                },
              }
            : {}),
        },
      ]),
    ),
  };
}
export function resolveNativeReferences(input, choices) {
  return resolveWorkflowDraftNativeReferenceRepair({
    ...input,
    fingerprint: describeWorkflowDraftNativeReferenceRepair(input).fingerprint,
    proposal: nativeReferenceProposal(input, choices),
  });
}
