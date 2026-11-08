import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWorkflowExecutionProgram } from '@openapi-flow/core';
import {
  executionProgramBranchFixture,
  executionProgramNode as node,
  executionProgramBranch as branch,
} from './fixtures/execution-program-branch-fixture.mjs';

test('conditional alternatives continue without waiting for the unselected branch', () => {
  const input = executionProgramBranchFixture();
  input.nativeNodes = input.nativeNodes.filter((n) => n.id !== 'other');
  const program = {
    kind: 'execution-program',
    body: { kind: 'sequence', steps: [node('seed'), branch(), node('done')] },
  };
  const result = resolveWorkflowExecutionProgram({ ...input, program });
  assert.equal(result.generatedNodeIds.length, 0);
  assert.equal(result.plan.edges.filter((e) => e.to === 'done').length, 2);
});
test('nested alternatives inside parallel work collapse to one chosen completion before an all-input barrier', () => {
  const input = executionProgramBranchFixture();
  const program = {
    kind: 'execution-program',
    body: {
      kind: 'sequence',
      steps: [
        node('seed'),
        {
          kind: 'parallel',
          branches: [branch(), node('other')],
          join: { kind: 'barrier' },
        },
        node('done'),
      ],
    },
  };
  const result = resolveWorkflowExecutionProgram({ ...input, program });
  assert.deepEqual(
    result.plan.nativeNodes
      .filter((n) => result.generatedNodeIds.includes(n.id))
      .map((n) => n.capability),
    ['execution-alternative-rejoin', 'execution-parallel-barrier'],
  );
  assert.equal(result.plan.edges.filter((e) => e.to === 'done').length, 1);
});
test('rejects rewinding execution to an earlier producer', () => {
  const input = executionProgramBranchFixture();
  input.nativeNodes = input.nativeNodes.filter((n) => n.id !== 'other');
  const program = {
    kind: 'execution-program',
    body: {
      kind: 'sequence',
      steps: [
        node('seed'),
        branch(),
        { kind: 'reuse', nodeId: 'yes' },
        node('done'),
      ],
    },
  };
  assert.throws(
    () => resolveWorkflowExecutionProgram({ ...input, program }),
    /Invalid input/,
  );
});
test('a terminal alternative is excluded from subsequent live control flow', () => {
  const input = executionProgramBranchFixture();
  input.nativeNodes = input.nativeNodes.filter(
    (n) => !['no', 'other'].includes(n.id),
  );
  input.nativeNodes.push({
    id: 'stop',
    capability: 'stop-and-error',
    parameters: { message: 'Stop the selected path' },
  });
  const conditional = branch();
  conditional.paths[1].body = node('stop');
  const result = resolveWorkflowExecutionProgram({
    ...input,
    program: {
      kind: 'execution-program',
      body: {
        kind: 'sequence',
        steps: [node('seed'), conditional, node('done')],
      },
    },
  });
  assert.equal(result.plan.edges.filter((e) => e.to === 'done').length, 1);
  assert.equal(result.plan.edges.find((e) => e.to === 'done').from, 'yes');
});
test('does not accept missing, duplicate or invented conditional outputs', () => {
  const input = executionProgramBranchFixture();
  for (const change of [
    (b) => b.paths.pop(),
    (b) => (b.paths[1].output = 'true'),
    (b) => (b.paths[0].output = 'invented'),
  ]) {
    const conditional = branch();
    change(conditional);
    assert.throws(
      () =>
        resolveWorkflowExecutionProgram({
          ...input,
          program: { kind: 'execution-program', body: conditional },
        }),
      /each declared exclusive output|Too small/,
    );
  }
});

test('shared empty JSON blocks preserve the selected path without inventing repeated work', () => {
  const input = executionProgramBranchFixture();
  input.nativeNodes = input.nativeNodes.filter(
    (node) => !['yes', 'no'].includes(node.id),
  );
  const empty = { kind: 'empty' };
  const conditional = {
    kind: 'branch',
    nodeId: 'condition',
    paths: [
      { output: 'true', body: empty },
      { output: 'false', body: empty },
    ],
  };
  const result = resolveWorkflowExecutionProgram({
    ...input,
    program: {
      kind: 'execution-program',
      body: {
        kind: 'sequence',
        steps: [node('seed'), conditional, node('other'), node('done')],
      },
    },
  });
  assert.equal(
    result.plan.edges.filter((edge) => edge.to === 'other').length,
    2,
  );
});
