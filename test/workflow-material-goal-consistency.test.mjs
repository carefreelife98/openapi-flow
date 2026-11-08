import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkflowConnectionSession } from '@openapi-flow/core';
import { incrementalConnectionFixture } from './fixtures/incremental-connection-fixture.mjs';

test('rejects two exact values for the same declared material field before adopting connection goals', () => {
  const { source, goals } = incrementalConnectionFixture();
  const target = {
    kind: 'material-value',
    nodeId: 'source',
    materialKind: 'api-operation',
    pointer: '/path',
    factIds: ['intent'],
  };
  assert.throws(
    () =>
      createWorkflowConnectionSession({
        ...source,
        goals: [
          ...goals,
          { ...target, expected: '/first', reason: 'First model goal.' },
          { ...target, expected: '/second', reason: 'Second model goal.' },
        ],
      }),
    /conflicting exact values/i,
  );
});

test('permits equivalent exact values stated for different requirement clauses', () => {
  const { source, goals } = incrementalConnectionFixture();
  const target = {
    kind: 'material-value',
    nodeId: 'source',
    materialKind: 'api-operation',
    pointer: '/path',
    factIds: ['intent'],
    expected: '/first',
  };
  assert.doesNotThrow(() =>
    createWorkflowConnectionSession({
      ...source,
      goals: [
        ...goals,
        { ...target, reason: 'One clause.' },
        { ...target, reason: 'Another clause.' },
      ],
    }),
  );
});
