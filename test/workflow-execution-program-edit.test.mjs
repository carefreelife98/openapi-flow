import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeWorkflowDraftExecutionProgram,
  resolveWorkflowExecutionProgram,
  assembleWorkflowDraftEdit,
} from '@openapi-flow/core';
import {
  connectionEditPlan,
  workflowDraftConnectionEditFixture,
} from './fixtures/workflow-draft-connection-edit-fixture.mjs';
const limits = { maxDepth: 20, maxBlocks: 100 };
const program = {
  kind: 'execution-program',
  body: {
    kind: 'sequence',
    steps: ['source', 'follow', 'independent'].map((nodeId) => ({
      kind: 'node',
      nodeId,
    })),
  },
};
test('draft edits lower one source-bound program into one revision without model edge deltas', async () => {
  const input = await workflowDraftConnectionEditFixture();
  const before = globalThis.structuredClone(input.draft);
  const source = describeWorkflowDraftExecutionProgram({ ...input, limits });
  const result = resolveWorkflowExecutionProgram({ ...source, program });
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    executionProgram: { limits, result },
  });
  assert.equal(candidate.status, 'changed');
  assert.equal(candidate.draft.revision, before.revision + 1);
  assert.deepEqual(candidate.draft.apiCalls, before.apiCalls);
  assert.deepEqual(candidate.draft.edges, result.plan.edges);
  assert.deepEqual(input.draft, before);
});
test('draft program adoption rejects mixed authorities, stale material sources and removal of protected edges', async () => {
  const input = await workflowDraftConnectionEditFixture();
  const source = describeWorkflowDraftExecutionProgram({ ...input, limits });
  const result = resolveWorkflowExecutionProgram({ ...source, program });
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({
        ...input,
        connections: [],
        executionProgram: { limits, result },
      }),
    /one connection authority/,
  );
  const stale = globalThis.structuredClone(result);
  stale.sourceFingerprint = 'stale';
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({
        ...input,
        executionProgram: { limits, result: stale },
      }),
    /receipt/,
  );
  assert.throws(
    () =>
      resolveWorkflowExecutionProgram({
        ...source,
        program: {
          kind: 'execution-program',
          body: {
            kind: 'sequence',
            steps: ['source', 'independent', 'follow'].map((nodeId) => ({
              kind: 'node',
              nodeId,
            })),
          },
        },
      }),
    /protected source edge/,
  );
});

test('material-only edits preserve independent original outputs without inventing a join', async () => {
  const input = await workflowDraftConnectionEditFixture();
  input.plan = connectionEditPlan(input, [
    { kind: 'revise-api-inputs', nodeId: 'independent' },
  ]);
  input.resolutions = [
    {
      stepId: input.plan.steps[0].id,
      kind: 'api-inputs',
      edits: [{ kind: 'set', pointer: '/path/id', value: 'revised-id' }],
    },
  ];
  const source = describeWorkflowDraftExecutionProgram({ ...input, limits });
  const terminal = {
    kind: 'execution-program',
    body: {
      kind: 'parallel',
      branches: [
        {
          kind: 'sequence',
          steps: ['source', 'follow'].map((nodeId) => ({
            kind: 'node',
            nodeId,
          })),
        },
        { kind: 'node', nodeId: 'independent' },
      ],
      join: { kind: 'none' },
    },
  };
  const result = resolveWorkflowExecutionProgram({
    ...source,
    program: terminal,
  });
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    executionProgram: { limits, result },
  });
  assert.deepEqual(candidate.draft.edges, input.draft.edges);
  assert.equal(result.generatedNodeIds.length, 0);
  assert.equal(
    candidate.draft.apiCalls.find((call) => call.id === 'independent').values
      .path.id,
    'revised-id',
  );
  assert.throws(
    () =>
      resolveWorkflowExecutionProgram({
        ...source,
        program: {
          kind: 'execution-program',
          body: { kind: 'sequence', steps: [terminal.body, { kind: 'empty' }] },
        },
      }),
    /unreachable work/,
  );
});
