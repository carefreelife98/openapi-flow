import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  inspectWorkflowPlanningConstraints,
  createWorkflowConnectionSession,
  createWorkflowConnectionPlan,
  WorkflowPlanningConstraintError,
  workflowPlanningConstraintInspectionSchema,
  workflowConnectionEdgeId,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionGoals,
  createWorkflowConnectionGoalRejection,
} from '@openapi-flow/langchain';
import { incrementalConnectionFixture as fixture } from './fixtures/incremental-connection-fixture.mjs';
import { connectionPlanningModel } from './fixtures/connection-planning-record-fixture.mjs';

const basis = {
  factIds: ['intent'],
  reason: 'Preserve the original requirement.',
};

test('selected bindings produce dependency evidence, without generating edges or changing inputs', () => {
  const { source, goals } = fixture();
  const before = globalThis.structuredClone(source.materials);
  const inspection = inspectWorkflowPlanningConstraints({ ...source, goals });
  assert.equal(inspection.checkedScope, 'necessary-node-order');
  assert.equal(inspection.conflicts.length, 0);
  assert(
    inspection.dependencies.some(
      (edge) =>
        edge.from === 'source' &&
        edge.to === 'detail' &&
        edge.origin.kind === 'value-reference' &&
        edge.origin.pointer === '/id',
    ),
  );
  assert.deepEqual(
    inspection,
    workflowPlanningConstraintInspectionSchema.parse(inspection),
  );
  assert.deepEqual(source.materials, before);
  assert.deepEqual(source.edges, []);
  assert.deepEqual(JSON.parse(JSON.stringify(inspection)), inspection);
});

test('a reverse goal is rejected before accepting a session, with both conflicting sources preserved', () => {
  const { source } = fixture();
  const goals = [
    { kind: 'precedence', before: 'summary', after: 'source', ...basis },
  ];
  const inspection = inspectWorkflowPlanningConstraints({ ...source, goals });
  const conflict = inspection.conflicts.find(
    (item) => item.code === 'DEPENDENCY_CYCLE',
  );
  assert(conflict);
  assert.deepEqual(conflict.goalIndexes, [0]);
  assert(
    conflict.dependencies.some(
      (edge) => edge.origin.kind === 'value-reference',
    ),
  );
  assert(conflict.dependencies.some((edge) => edge.origin.kind === 'goal'));
  const before = globalThis.structuredClone(source.materials);
  assert.throws(
    () => createWorkflowConnectionSession({ ...source, goals }),
    (error) => {
      assert(error instanceof WorkflowPlanningConstraintError);
      assert.deepEqual(error.inspection, inspection);
      assert.equal(JSON.stringify(error).includes('dependencies'), false);
      return true;
    },
  );
  assert.deepEqual(source.materials, before);
});

test('native response reads also forbid a goal ordering the reader before its producer', () => {
  const { source } = fixture();
  source.nativeNodes.push({
    id: 'compare',
    capability: 'assert-responses',
    parameters: {
      checks: [
        {
          left: { source: 'response', nodeId: 'detail', pointer: '/price' },
          operator: 'equals',
          right: { source: 'response', nodeId: 'price', pointer: '/price' },
          message: 'Prices must agree.',
        },
      ],
    },
  });
  const goals = [
    { kind: 'precedence', before: 'compare', after: 'detail', ...basis },
  ];
  const inspection = inspectWorkflowPlanningConstraints({ ...source, goals });
  assert(
    inspection.conflicts.some(
      (item) =>
        item.code === 'DEPENDENCY_CYCLE' && item.nodeIds.includes('compare'),
    ),
  );
  assert.throws(
    () => createWorkflowConnectionSession({ ...source, goals }),
    WorkflowPlanningConstraintError,
  );
});

test('independent goals cannot contradict selected direct or transitive data dependencies', () => {
  const { source } = fixture();
  for (const nodeIds of [
    ['source', 'detail'],
    ['source', 'summary'],
  ]) {
    const goals = [{ kind: 'independent', nodeIds, ...basis }];
    const inspection = inspectWorkflowPlanningConstraints({ ...source, goals });
    const conflict = inspection.conflicts.find(
      (item) => item.code === 'INDEPENDENCE_CONFLICT',
    );
    assert(conflict);
    assert.deepEqual(conflict.goalIndexes, [0]);
    assert.equal(conflict.nodeIds[0], 'source');
    assert.equal(conflict.nodeIds.at(-1), nodeIds[1]);
    assert.throws(
      () => createWorkflowConnectionSession({ ...source, goals }),
      WorkflowPlanningConstraintError,
    );
  }
});

test('model goals can contradict one another without a data binding, and no goal is silently reversed', () => {
  const { source } = fixture();
  const goals = [
    { kind: 'precedence', before: 'detail', after: 'price', ...basis },
    { kind: 'precedence', before: 'price', after: 'stock', ...basis },
    { kind: 'precedence', before: 'stock', after: 'detail', ...basis },
  ];
  const before = globalThis.structuredClone(goals);
  const inspection = inspectWorkflowPlanningConstraints({ ...source, goals });
  const conflict = inspection.conflicts.find((item) =>
    item.dependencies.every((edge) => edge.origin.kind === 'goal'),
  );
  assert(conflict);
  assert.deepEqual([...conflict.goalIndexes].sort(), [0, 1, 2]);
  assert.deepEqual(goals, before);
});

test('protected edges participate in feasibility; explicitly editable edges are not frozen obligations', () => {
  const { source } = fixture();
  const edge = { from: 'detail', output: 'main', to: 'price', input: 'main' };
  source.edges = [edge];
  const goals = [
    { kind: 'precedence', before: 'price', after: 'detail', ...basis },
  ];
  assert(
    inspectWorkflowPlanningConstraints({ ...source, goals }).conflicts.some(
      (item) =>
        item.dependencies.some(
          (edge) => edge.origin.kind === 'protected-connection',
        ),
    ),
  );
  assert.equal(
    inspectWorkflowPlanningConstraints({
      ...source,
      goals,
      editableEdgeIds: [workflowConnectionEdgeId(edge)],
    }).conflicts.length,
    0,
  );
  assert.doesNotThrow(() =>
    createWorkflowConnectionSession({
      ...source,
      goals,
      editableEdgeIds: [workflowConnectionEdgeId(edge)],
    }),
  );
  assert.throws(
    () =>
      inspectWorkflowPlanningConstraints({
        ...source,
        goals,
        editableEdgeIds: ['unknown'],
      }),
    /editableEdgeIds/,
  );
});

test('input-specific reads remain scoped and are not promoted to every execution of the consumer', () => {
  const { source } = fixture();
  source.capabilities.push({
    name: 'scoped-reader',
    description: 'Read only the source of the actual incoming port.',
    parametersSchema: z.strictObject({}),
    inputPorts: () => ['left', 'right'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    inputReferences: () => ({
      left: [{ source: 'response', nodeId: 'source', pointer: '' }],
      right: [{ source: 'response', nodeId: 'detail', pointer: '' }],
    }),
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  });
  source.nativeNodes.push({
    id: 'scoped',
    capability: 'scoped-reader',
    parameters: {},
  });
  const inspection = inspectWorkflowPlanningConstraints({
    ...source,
    goals: [{ kind: 'independent', nodeIds: ['scoped', 'detail'], ...basis }],
  });
  assert.equal(inspection.conflicts.length, 0);
  const reads = inspection.dependencies.filter((edge) => edge.to === 'scoped');
  assert.equal(reads.length, 2);
  assert(reads.every((edge) => edge.scope.kind === 'input-port'));
  assert.deepEqual(
    reads.map((edge) => edge.scope.port),
    ['left', 'right'],
  );
});

test('single-pass compilation retains its full graph checks even when necessary-order inspection finds no conflict', () => {
  const { source, plan } = fixture();
  assert.equal(inspectWorkflowPlanningConstraints(source).conflicts.length, 0);
  assert.throws(
    () =>
      createWorkflowConnectionPlan({
        ...source,
        proposal: {
          edges: plan.edges.filter((edge) => edge.from !== 'join'),
          blockedCalls: [],
          additionalGaps: [],
        },
      }),
    /not available on every incoming route/,
  );
  assert.doesNotThrow(() =>
    createWorkflowConnectionPlan({
      ...source,
      proposal: { edges: plan.edges, blockedCalls: [], additionalGaps: [] },
    }),
  );
});

test('a model-origin constraint failure is recoverable as typed private feedback, not a fabricated successful plan', async () => {
  const { source } = fixture();
  const output = {
    goals: [
      { kind: 'precedence', before: 'summary', after: 'source', ...basis },
    ],
  };
  const model = connectionPlanningModel(output);
  let failure;
  await assert.rejects(
    planWorkflowConnectionGoals({ ...source, model }),
    (error) => {
      failure = error;
      assert(error.cause instanceof WorkflowPlanningConstraintError);
      return true;
    },
  );
  assert.equal(model.calls, 1);
  const rejection = createWorkflowConnectionGoalRejection({
    ...source,
    error: failure,
  });
  assert(rejection);
  assert.deepEqual(rejection.output, output);
  assert(
    rejection.constraints.conflicts.some(
      (item) => item.code === 'DEPENDENCY_CYCLE',
    ),
  );
  assert.equal(
    createWorkflowConnectionGoalRejection({
      ...source,
      error: new Error('transport failed'),
    }),
    undefined,
  );
});
