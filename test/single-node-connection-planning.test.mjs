import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowDraft,
  describeWorkflowDraftConnectionEdit,
  assembleWorkflowDraftEdit,
} from '@openapi-flow/core';
import { planWorkflowDraftConnectionEdit } from '@openapi-flow/langchain';
import {
  createN8nNativeCapabilities,
  createPassThroughCapability,
} from '@openapi-flow/n8n';
import {
  canonicalInputReplyFixture,
  pauseCanonicalInputReply,
} from './fixtures/canonical-input-reply-fixture.mjs';
import {
  connectionEditPlan,
  connectionEditModel,
  connectionEditProposal,
  workflowDraftConnectionEditFixture,
} from './fixtures/workflow-draft-connection-edit-fixture.mjs';
import { draftConversationEditInput } from '../examples/langgraph-workflow/dist/graph/draft-conversation/draft-conversation-context.js';

async function resolvedApiInput() {
  const fixture = await canonicalInputReplyFixture({
    includeExplanations: false,
    deployments: [{ documentId: 'source', baseUrl: 'http://fixture.invalid' }],
  });
  const { pending } = await pauseCanonicalInputReply(fixture);
  const candidate = await fixture.resume(pending, {
    action: 'answer-inputs',
    messageId: 'typed-member',
    answers: [
      {
        requirementId: pending.questions[0].requirement.id,
        value: 'member-01',
      },
    ],
  });
  return {
    fixture,
    pending,
    candidate,
    input: draftConversationEditInput(candidate, fixture.dependencies),
  };
}

function nativeInput(nodes, edges = []) {
  const context = {
    operations: [],
    capabilities: [
      ...createN8nNativeCapabilities(),
      createPassThroughCapability(),
    ],
    messages: [
      {
        id: 'edit-1',
        text: 'Keep these actual nodes and inspect their connections.',
      },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'single-native-connections',
      apiCalls: [],
      nativeNodes: nodes,
      requirements: [],
      edges,
    },
  });
  const input = {
    context,
    draft,
    requestMessageIds: ['edit-1'],
    resolutions: [],
  };
  return {
    ...input,
    plan: connectionEditPlan(input, [
      { kind: 'revise-connections', nodeIds: nodes.map((node) => node.id) },
    ]),
  };
}

function addNativeInput(node) {
  const base = nativeInput([
    { id: 'seed', capability: 'pass-through', parameters: {} },
  ]);
  const draft = createWorkflowDraft({
    context: base.context,
    content: {
      id: 'single-new-native',
      apiCalls: [],
      nativeNodes: [],
      requirements: [],
      edges: [],
    },
  });
  const plan = connectionEditPlan({ ...base, draft }, [
    { kind: 'add-native-node', capability: node.capability },
  ]);
  return {
    ...base,
    draft,
    plan,
    resolutions: [
      {
        stepId: plan.steps[0].id,
        kind: 'native-literal',
        parameters: globalThis.structuredClone(node.parameters),
      },
    ],
  };
}

test('one actual API has a code-owned zero-edge proof and makes no connection model call', async () => {
  const { fixture, candidate, input } = await resolvedApiInput();
  const before = globalThis.structuredClone(input.draft);
  const description = describeWorkflowDraftConnectionEdit(input);
  assert.equal(description.status, 'not-required');
  assert.deepEqual(description.structuralProof, {
    kind: 'single-node-dag',
    nodeId: input.plan.steps[0].newNodeId,
  });
  assert.ok(description.steps.length);
  const result = await planWorkflowDraftConnectionEdit({
    ...input,
    model: {
      withStructuredOutput() {
        throw new Error('A single-node DAG has no connection decision');
      },
    },
  });
  assert.equal(result.status, 'not-required');
  assert.deepEqual(result.description, description);
  assert.deepEqual(
    assembleWorkflowDraftEdit(input),
    candidate.candidate.result,
  );
  assert.deepEqual(input.draft, before);
  assert.equal(
    fixture.calls.some((call) => call.name === 'plan_draft_connection_edit'),
    false,
  );
  assert.equal(candidate.__interrupt__[0].value.phase, 'candidate');
  const done = await fixture.resume(candidate, { action: 'approve' });
  assert.equal(done.phase, 'complete');
  assert.deepEqual(done.draft.edges, []);
  assert.equal(done.draft.apiCalls.length, 1);
  assert.equal(done.artifact.triggerConnected, true);
});

test('missing input resolution remains waiting, never a singleton proof that bypasses unresolved work', async () => {
  const { fixture, pending } = await resolvedApiInput();
  const described = describeWorkflowDraftConnectionEdit(
    draftConversationEditInput(pending, fixture.dependencies),
  );
  assert.equal(described.status, 'waiting-for-materials');
  assert.equal(described.structuralProof, undefined);
});

test('single native instances use actual main input and dependency contracts, including literal IF outputs', () => {
  for (const node of [
    { id: 'pass', capability: 'pass-through', parameters: {} },
    {
      id: 'literal-if',
      capability: 'if',
      parameters: {
        combinator: 'and',
        conditions: [
          {
            left: { source: 'literal', value: 2 },
            operator: 'equals',
            right: { source: 'literal', value: 2 },
          },
        ],
      },
    },
  ]) {
    const input = addNativeInput(node);
    const described = describeWorkflowDraftConnectionEdit(input);
    assert.equal(described.status, 'not-required');
    assert.equal(
      described.structuralProof.nodeId,
      input.plan.steps[0].newNodeId,
    );
    const kept = assembleWorkflowDraftEdit(input);
    assert.equal(kept.status, 'changed');
    assert.equal(kept.draft.nativeNodes.length, 1);
    assert.deepEqual(kept.draft.edges, []);
  }
  const join = addNativeInput({
    capability: 'merge-append',
    parameters: { numberInputs: 2 },
  });
  assert.equal(describeWorkflowDraftConnectionEdit(join).status, 'ready');
  assert.equal(
    describeWorkflowDraftConnectionEdit(join).structuralProof,
    undefined,
  );
  assert.throws(
    () => assembleWorkflowDraftEdit(join),
    /each join input requires exactly one source/,
  );
});

test('explicit connection intent remains model-owned even for one instance; a deliberate keep preserves the revision', async () => {
  const input = nativeInput([
    { id: 'single', capability: 'pass-through', parameters: {} },
  ]);
  assert.equal(describeWorkflowDraftConnectionEdit(input).status, 'ready');
  const message = 'The requested routing intent needs clarification.';
  const model = connectionEditModel(
    connectionEditProposal(input, [{ kind: 'needs-clarification', message }]),
  );
  const result = await planWorkflowDraftConnectionEdit({ ...input, model });
  assert.equal(model.requests.length, 1);
  assert.equal(result.status, 'needs-clarification');
  assert.equal(result.questions[0].message, message);
  const kept = assembleWorkflowDraftEdit({ ...input, connections: [] });
  assert.equal(kept.status, 'no-change');
  assert.deepEqual(kept.draft, input.draft);
});

test('multiple actual nodes still require routing; a singleton after recorded removal has no new edge decision', async () => {
  const input = await workflowDraftConnectionEditFixture();
  assert.equal(describeWorkflowDraftConnectionEdit(input).status, 'ready');
  const existing = nativeInput(
    [
      { id: 'source', capability: 'pass-through', parameters: {} },
      { id: 'removed', capability: 'pass-through', parameters: {} },
    ],
    [{ from: 'source', output: 'main', to: 'removed', input: 'main' }],
  );
  const plan = connectionEditPlan(existing, [
    { kind: 'remove-node', nodeId: 'removed' },
  ]);
  const described = describeWorkflowDraftConnectionEdit({ ...existing, plan });
  assert.equal(described.status, 'not-required');
  assert.deepEqual(described.structuralProof, {
    kind: 'single-node-dag',
    nodeId: 'source',
  });
  assert.deepEqual(
    described.stage.nodeRemovalConnections.map((change) => change.edge),
    existing.draft.edges,
  );
  assert.deepEqual(described.stage.content.edges, []);
});

test('singleton fingerprints bind actual parameter resolutions and original messages', async () => {
  const { input } = await resolvedApiInput();
  const original = describeWorkflowDraftConnectionEdit(input);
  const changed = globalThis.structuredClone(input);
  changed.resolutions[0].values.path.id = 'member-02';
  const next = describeWorkflowDraftConnectionEdit(changed);
  assert.equal(next.status, 'not-required');
  assert.notEqual(next.fingerprint, original.fingerprint);
  assert.deepEqual(next.structuralProof, original.structuralProof);
});
