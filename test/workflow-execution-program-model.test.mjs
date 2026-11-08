import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planWorkflowExecutionProgram,
  reviewWorkflowExecutionProgram,
  WorkflowProgramPlanningError,
} from '@openapi-flow/langchain';
import { resolveWorkflowExecutionProgram } from '@openapi-flow/core';
import { createN8nWorkflowProgramControls } from '@openapi-flow/n8n';
import { incrementalConnectionFixture } from './fixtures/incremental-connection-fixture.mjs';
import { connectionPlanningModel } from './fixtures/connection-planning-record-fixture.mjs';

const node = (nodeId) => ({ kind: 'node', nodeId });
const program = {
  kind: 'execution-program',
  body: {
    kind: 'sequence',
    steps: [
      node('source'),
      {
        kind: 'parallel',
        branches: ['detail', 'price', 'stock'].map(node),
        join: node('join'),
      },
      node('summary'),
    ],
  },
};
function fixture() {
  return {
    ...incrementalConnectionFixture().source,
    edges: [],
    gaps: [],
    controls: createN8nWorkflowProgramControls(),
    limits: { maxBlocks: 100, maxDepth: 20 },
  };
}
const accepted = {
  status: 'accepted',
  findings: [],
  question: null,
  revisionTarget: null,
  materialRepair: null,
};

test('requests a compact strict program once, without a second material-goal inventory or OAS documents', async () => {
  const input = fixture();
  const model = connectionPlanningModel(
    program,
    ({ context, schema, options }) => {
      assert.equal(options.name, 'plan_workflow_execution_program');
      assert.equal(options.strict, true);
      assert.equal(options.method, 'jsonSchema');
      assert.equal('goals' in context, false);
      assert.equal('materialValueChoices' in context, false);
      assert.equal(context.operations.length, 5);
      assert.equal(context.nodes.length, 6);
      assert.equal('operation' in context.materials[0], false);
      assert.equal('parametersSchema' in context.nativeNodes[0], false);
      assert.ok(JSON.stringify(schema).includes('$ref'));
      assert.equal(JSON.stringify(schema).includes('addEdges'), false);
    },
  );
  const result = await planWorkflowExecutionProgram({ ...input, model });
  assert.equal(model.calls, 1);
  assert.equal(result.plan.edges.length, 7);
});
test('replays the exact source and program before independently reviewing business meaning', async () => {
  const input = fixture();
  const result = resolveWorkflowExecutionProgram({ ...input, program });
  const model = connectionPlanningModel(accepted, ({ context, options }) => {
    assert.equal(options.name, 'review_workflow_execution_program');
    assert.deepEqual(context.program, program);
    assert.equal('goals' in context, false);
    assert.equal(context.requirements.length, 1);
  });
  const review = await reviewWorkflowExecutionProgram({
    ...input,
    result,
    model,
  });
  assert.equal(review.review.status, 'accepted');
  assert.equal(model.calls, 1);
});
test('does not retry invalid model programs or accept a free-form edge decision', async () => {
  const input = fixture();
  const model = connectionPlanningModel({ kind: 'patch', addEdges: [] });
  await assert.rejects(
    planWorkflowExecutionProgram({ ...input, model }),
    WorkflowProgramPlanningError,
  );
  assert.equal(model.calls, 1);
});
test('rejects a material-goal list instead of silently converting it into a semantic review', async () => {
  const input = fixture();
  const result = resolveWorkflowExecutionProgram({ ...input, program });
  const model = connectionPlanningModel({
    ...accepted,
    goals: [
      { kind: 'material-value', pointer: '/left', expected: 'different' },
    ],
  });
  await assert.rejects(
    reviewWorkflowExecutionProgram({ ...input, result, model }),
    WorkflowProgramPlanningError,
  );
  assert.equal(model.calls, 1);
});
test('does not permit an accepted review carrying contradictory findings or a technical question', async () => {
  const input = fixture();
  const result = resolveWorkflowExecutionProgram({ ...input, program });
  for (const change of [
    { question: 'Fix the input port' },
    { findings: [{ nodeIds: ['source'], reason: 'Different value needed' }] },
  ]) {
    const model = connectionPlanningModel({ ...accepted, ...change });
    await assert.rejects(
      reviewWorkflowExecutionProgram({ ...input, result, model }),
      WorkflowProgramPlanningError,
    );
  }
});
test('rejects stale feedback and source mutation before adopting a generated program', async () => {
  const input = fixture();
  const model = connectionPlanningModel(program);
  await assert.rejects(
    planWorkflowExecutionProgram({
      ...input,
      model,
      feedback: {
        sourceFingerprint: 'stale',
        previousProgram: program,
        reason: 'Previous failure',
      },
    }),
    /stale/,
  );
  assert.equal(model.calls, 0);
  const changing = fixture();
  const mutate = connectionPlanningModel(program, () => {
    changing.scenario += ' Changed.';
  });
  await assert.rejects(
    planWorkflowExecutionProgram({
      ...changing,
      model: mutate,
      controls: changing.controls,
      get scenario() {
        return changing.scenario;
      },
    }),
    /source changed/,
  );
});
test('preserves original transport failures and makes exactly one invocation', async () => {
  const input = fixture();
  let calls = 0;
  const failure = new Error('transport failed');
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          calls++;
          throw failure;
        },
      };
    },
  };
  await assert.rejects(
    planWorkflowExecutionProgram({ ...input, model }),
    (error) => error.cause === failure,
  );
  assert.equal(calls, 1);
});

test('the model output contract binds a selected join to its actual input cardinality', async () => {
  const input = fixture();
  const invalid = globalThis.structuredClone(program);
  invalid.body.steps[1].branches.pop();
  const model = connectionPlanningModel(invalid);
  await assert.rejects(
    planWorkflowExecutionProgram({ ...input, model }),
    (error) =>
      error instanceof WorkflowProgramPlanningError &&
      error.diagnostic.stage === 'model-output',
  );
  assert.equal(model.calls, 1);
});
