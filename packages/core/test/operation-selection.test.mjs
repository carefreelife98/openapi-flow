import assert from 'node:assert/strict';
import test from 'node:test';
import { selectOperationFromCandidates } from '../dist/planning/select-operation.js';

const operations = [
  {
    operationRef: '#/paths/~1items~1{id}/get',
    method: 'GET',
    path: '/items/{id}',
    summary: 'Read one item',
    description: '',
    tags: ['Items'],
  },
  {
    operationRef: '#/paths/~1items/post',
    method: 'POST',
    path: '/items',
    summary: 'Create an item',
    description: '',
    tags: ['Items'],
  },
];

test('selection uses OAS metadata and returns only a declared operationRef', async () => {
  const model = {
    withStructuredOutput(schema, options) {
      assert.equal(options.name, 'select_operation');
      assert.deepEqual(schema.properties.operationRef.enum, [
        operations[0].operationRef,
        operations[1].operationRef,
      ]);
      return {
        async invoke(messages) {
          const request = JSON.parse(messages[1][1]);
          assert.equal(request.scenario, 'Create an item');
          assert.deepEqual(request.operations[1].tags, ['Items']);
          return { operationRef: operations[1].operationRef };
        },
      };
    },
  };
  assert.equal(
    await selectOperationFromCandidates(operations, 'Create an item', model),
    operations[1].operationRef,
  );
});

test('selection rejects an unknown reference and invalid input before workflow creation', async () => {
  const model = {
    withStructuredOutput: () => ({
      invoke: async () => ({ operationRef: 'unknown' }),
    }),
  };
  await assert.rejects(
    selectOperationFromCandidates(operations, 'Create an item', model),
    /outside spec.paths/,
  );
  await assert.rejects(
    selectOperationFromCandidates([], 'Create an item', model),
    /no operations/,
  );
  await assert.rejects(
    selectOperationFromCandidates(operations, '', model),
    /scenario must be non-empty/,
  );
});
