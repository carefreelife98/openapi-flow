import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver } from '@langchain/langgraph';
import { createWorkflowConnectionSession } from '@openapi-flow/core';
import {
  planWorkflowConnectionStep,
  createWorkflowConnectionStepRejection,
  WorkflowConnectionPlanningError,
} from '@openapi-flow/langchain';
import {
  createIncrementalWorkflowConnectionGraph,
  IncrementalConnectionLimitError,
} from '@openapi-flow/example-langgraph-workflow';
import {
  incrementalConnectionFixture as fixture,
  incrementalConnectionPatch as patch,
  incrementalConnectionModelRegion as region,
} from './fixtures/incremental-connection-fixture.mjs';

const policy = {
  maxModelInvocations: 8,
  maxRejectedProposals: 3,
  deadlineMs: 30000,
};
function setup() {
  const { source, goals, plan } = fixture();
  const good = {
    decision: region(
      source,
      patch({
        addEdges: plan.edges,
        addRootNodeIds: ['source'],
        addTerminals: [{ nodeId: 'summary', output: 'main' }],
      }),
    ),
  };
  const bad = globalThis.structuredClone(good);
  const node = bad.decision.nodes.find((n) => n.incoming.length);
  node.incoming.push(globalThis.structuredClone(node.incoming[0]));
  const calls = [];
  const model = (outputs) => ({
    withStructuredOutput() {
      return {
        async invoke(messages) {
          calls.push(JSON.parse(messages[1].content));
          const next = outputs.shift();
          if (next instanceof Error) throw next;
          assert.notEqual(next, undefined, 'unexpected model invocation');
          return next;
        },
      };
    },
  });
  return { source, goals, good, bad, calls, model };
}

test('duplicate incoming is a typed unadopted region rejection, then corrected within the existing budget', async () => {
  const f = setup();
  const saved = [];
  const progress = [];
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => f.source,
    model: f.model([{ goals: f.goals }, f.bad, f.good]),
    policy,
    recordProposalAttempt: async (attempt) =>
      saved.push(globalThis.structuredClone(attempt)),
    observe: (event) => progress.push(event),
  });
  const result = await graph.invoke({});
  assert.equal(result.status, 'complete');
  assert.equal(result.modelInvocations, 3);
  assert.equal(result.rejectedProposals.length, 1);
  const rejection = result.rejectedProposals[0];
  assert.equal(rejection.proposal.kind, 'set-region');
  assert.equal(rejection.expected.revision, 0);
  assert.equal(rejection.violations[0].details.rule, 'duplicate-connection');
  assert.equal(rejection.violations[0].details.indexes.length, 2);
  assert.deepEqual(f.calls[2].rejectedProposals, [rejection]);
  assert.equal(result.session.revision, 1);
  assert.deepEqual(progress.find((p) => p.rejectedProposals === 1).edges, []);
  assert.equal(saved.length, 2);
  assert.notEqual(saved[0].id, saved[1].id);
  assert.deepEqual(saved[0].capture, { status: 'captured', output: f.bad });
  f.bad.decision.nodes.length = 0;
  assert.notEqual(saved[0].capture.output.decision.nodes.length, 0);
  assert.equal(JSON.stringify(progress).includes('capture'), false);
});

test('private sink failure resumes from checkpoint without calling the model again', async () => {
  const f = setup();
  let unavailable = true;
  const saved = [];
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => f.source,
    model: f.model([{ goals: f.goals }, f.bad, f.good]),
    policy,
    checkpointer: new MemorySaver(),
    recordProposalAttempt: async (attempt) => {
      if (unavailable) throw new Error('private diagnostic store unavailable');
      saved.push(globalThis.structuredClone(attempt));
    },
  });
  const config = { configurable: { thread_id: 'private-proposal-sink' } };
  await assert.rejects(
    graph.invoke({}, config),
    /private diagnostic store unavailable/,
  );
  assert.equal(f.calls.length, 2);
  const snapshot = await graph.getState(config);
  assert.deepEqual(snapshot.next, ['publishProposalAttempt']);
  assert.equal(snapshot.values.rejectedProposals.length, 1);
  assert.equal(snapshot.values.session.revision, 0);
  assert.deepEqual(snapshot.values.proposalAttempt.capture.output, f.bad);
  unavailable = false;
  const result = await graph.invoke(null, config);
  assert.equal(result.status, 'complete');
  assert.equal(f.calls.length, 3);
  assert.equal(saved.length, 2);
});

test('conversion rejections consume the same rejected-proposal limit', async () => {
  const f = setup();
  await assert.rejects(
    createIncrementalWorkflowConnectionGraph({
      source: () => f.source,
      model: f.model([{ goals: f.goals }, f.bad, f.bad]),
      policy: { ...policy, maxRejectedProposals: 1 },
    }).invoke({}),
    (error) => {
      assert.ok(error instanceof IncrementalConnectionLimitError);
      return true;
    },
  );
  assert.equal(f.calls.length, 3);
});

test('only actual current-source typed region validation can become feedback', async () => {
  const f = setup();
  const session = createWorkflowConnectionSession({
    ...f.source,
    goals: f.goals,
  });
  let failure;
  await assert.rejects(
    planWorkflowConnectionStep({
      ...f.source,
      session,
      model: f.model([f.bad]),
    }),
    (error) => {
      failure = error;
      return true;
    },
  );
  assert.ok(failure instanceof WorkflowConnectionPlanningError);
  assert.deepEqual(failure.proposalAttempt.capture.output, f.bad);
  const rejection = createWorkflowConnectionStepRejection({
    ...f.source,
    session,
    error: failure,
  });
  assert.ok(rejection);
  const forged = globalThis.structuredClone(rejection);
  forged.violations[0].message = 'forged explanation';
  await assert.rejects(
    planWorkflowConnectionStep({
      ...f.source,
      session,
      model: f.model([f.good]),
      rejectedProposals: [forged],
    }),
    /must match current source validation/,
  );
  assert.equal(f.calls.length, 1);
  failure.cause.region.nodes[0].root = !failure.cause.region.nodes[0].root;
  assert.throws(
    () =>
      createWorkflowConnectionStepRejection({
        ...f.source,
        session,
        error: failure,
      }),
    /differs from current source validation/,
  );
  assert.equal(
    createWorkflowConnectionStepRejection({
      ...f.source,
      session,
      error: new Error(
        'Connection region.nodes.incoming contains duplicate connections',
      ),
    }),
    undefined,
  );
});

test('invalid wire output is captured privately but stays fatal without a retry', async () => {
  const f = setup();
  const saved = [];
  const output = {
    decision: {
      kind: 'not-a-decision',
      reason: 'retain the original malformed value',
    },
  };
  await assert.rejects(
    createIncrementalWorkflowConnectionGraph({
      source: () => f.source,
      model: f.model([{ goals: f.goals }, output]),
      policy,
      recordProposalAttempt: async (attempt) => saved.push(attempt),
    }).invoke({}),
    (error) => {
      assert.ok(error instanceof WorkflowConnectionPlanningError);
      return true;
    },
  );
  assert.equal(f.calls.length, 2);
  assert.deepEqual(saved[0].capture.output, output);
});

test('sensitive output is explicitly withheld and never recorded as an original proposal', async () => {
  const f = setup();
  const saved = [];
  const output = {
    decision: { kind: 'not-a-decision', password: 'synthetic-sensitive-value' },
  };
  await assert.rejects(
    createIncrementalWorkflowConnectionGraph({
      source: () => f.source,
      model: f.model([{ goals: f.goals }, output]),
      policy,
      recordProposalAttempt: async (attempt) => saved.push(attempt),
    }).invoke({}),
  );
  assert.deepEqual(saved[0].capture, {
    status: 'withheld',
    reason: 'sensitive-content',
  });
  assert.equal(
    JSON.stringify(saved).includes('synthetic-sensitive-value'),
    false,
  );
});

test('private file records are atomic, owner-only and idempotent without replacing a conflicting original', async () => {
  const { mkdtemp, readFile, lstat, readdir, rm } =
    await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createConnectionProposalFileStore } =
    await import('@openapi-flow/example-langgraph-workflow');
  const directory = await mkdtemp(join(tmpdir(), 'connection-private-'));
  try {
    const f = setup();
    const session = createWorkflowConnectionSession({
      ...f.source,
      goals: f.goals,
    });
    const result = await planWorkflowConnectionStep({
      ...f.source,
      session,
      model: f.model([f.good]),
    });
    const attempt = result.proposalAttempt;
    const store = createConnectionProposalFileStore(directory);
    await Promise.all([store(attempt), store(attempt)]);
    const path = join(directory, attempt.id + '.json');
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), attempt);
    assert.equal((await lstat(path)).mode & 0o777, 0o600);
    assert.equal((await lstat(directory)).mode & 0o777, 0o700);
    const changed = globalThis.structuredClone(attempt);
    changed.capture.output.decision.reason = 'different same-ID output';
    await assert.rejects(store(changed), /conflicts with an existing original/);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), attempt);
    assert.deepEqual(await readdir(directory), [attempt.id + '.json']);
    assert.throws(
      () => createConnectionProposalFileStore('relative/path'),
      /absolute private directory/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
