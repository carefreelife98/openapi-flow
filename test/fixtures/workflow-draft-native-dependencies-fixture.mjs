import {
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
  resolveWorkflowDraftNativeDependencies,
  describeWorkflowDraftNativeNodeAddition,
  resolveWorkflowDraftNativeNodeAddition,
} from '@openapi-flow/core';
import {
  nativeDependencyCapabilities,
  nativeDependencyChoices,
  nativeDependencyValues,
} from './native-instance-dependencies-fixture.mjs';

export function draftNativeDependencyBase(withPrepared = true) {
  const context = {
    operations: [],
    capabilities: nativeDependencyCapabilities(),
    messages: [],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'draft-producer-dependencies',
      apiCalls: [],
      requirements: [],
      edges: [],
      nativeNodes: withPrepared
        ? [
            {
              id: 'unrelated-existing',
              capability: 'original-groups',
              parameters: { groups: [] },
            },
          ]
        : [],
    },
  });
  return { draft, context };
}

export function draftNativeDependencyFixture({
  withPrepared = true,
  includeExplanations = false,
} = {}) {
  const base = draftNativeDependencyBase(withPrepared);
  const message = {
    id: 'request',
    text: 'Create original groups, then split groups, then split each parent children. Keep all existing nodes unchanged.',
  };
  const context = { ...base.context, messages: [message] };
  const input = {
    ...base,
    context,
    requestMessageIds: [message.id],
    resolutions: [],
    repairs: [],
  };
  const sources = [
    { kind: 'message', messageId: message.id, quote: message.text },
  ];
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations },
    proposal: {
      decisions: nativeDependencyChoices().map((role) => ({
        kind: 'add-native-node',
        capability: role.capability,
        instruction: role.purpose,
        sources,
        ...(includeExplanations
          ? {
              explanation: {
                reason: 'Use the requested role.',
                evidence: sources,
              },
            }
          : {}),
      })),
    },
  });
  const [child, parent, source] = plan.steps;
  const proposal = {
    sourcesByNodeId: Object.fromEntries(
      [
        [child.newNodeId, [parent.newNodeId]],
        [parent.newNodeId, [source.newNodeId]],
        [source.newNodeId, []],
      ].map(([id, sourceNodeIds]) => [
        id,
        {
          sourceNodeIds,
          ...(includeExplanations && sourceNodeIds.length
            ? { reason: 'Use the explicitly requested producer role.' }
            : {}),
        },
      ]),
    ),
  };
  const producerDependencies = resolveWorkflowDraftNativeDependencies({
    ...input,
    plan,
    proposal,
  });
  return {
    ...input,
    plan,
    child,
    parent,
    source,
    proposal,
    producerDependencies,
  };
}

export function draftNativeAddition(
  input,
  step,
  parameters,
  resolutions = input.resolutions,
) {
  const scoped = { ...input, stepId: step.id, resolutions };
  const description = describeWorkflowDraftNativeNodeAddition(scoped);
  return resolveWorkflowDraftNativeNodeAddition({
    ...scoped,
    fingerprint: description.fingerprint,
    proposal: {
      decision: {
        status: 'provided',
        parameters,
        sourceMessageIds: input.requestMessageIds,
        ...(input.plan.options.includeExplanations
          ? {
              explanation: {
                reason:
                  'Use the requested actual setting and selected producer.',
                evidence: input.requestMessageIds.map((messageId) => ({
                  kind: 'message',
                  messageId,
                })),
              },
            }
          : {}),
      },
    },
  });
}

export function completedDraftNativeDependencies(f) {
  const source = draftNativeAddition(f, f.source, nativeDependencyValues);
  const parent = draftNativeAddition(
    f,
    f.parent,
    { sourceNodeId: f.source.newNodeId, pointer: '/groups' },
    [source.resolution],
  );
  const child = draftNativeAddition(
    f,
    f.child,
    { sourceNodeId: f.parent.newNodeId, pointer: '/item/children' },
    [source.resolution, parent.resolution],
  );
  return {
    source,
    parent,
    child,
    resolutions: [source.resolution, parent.resolution, child.resolution],
  };
}

export function draftNativeModel(respond, calls = []) {
  return {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          const call = {
            schema,
            options,
            name: options.name,
            messages,
            payload,
          };
          calls.push(call);
          return respond(call);
        },
      };
    },
  };
}
